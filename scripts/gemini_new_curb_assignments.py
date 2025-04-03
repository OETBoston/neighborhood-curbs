import geopandas as gpd
import pandas as pd
from shapely.geometry import Point, LineString
from shapely.ops import nearest_points
import warnings

# Suppress pandas SettingWithCopyWarning (use with caution)
pd.options.mode.chained_assignment = None
# Suppress Shapely future warning about spatial indexes
warnings.filterwarnings("ignore", category=FutureWarning, module="shapely")


def assign_curb_regulations(signs_geojson_path, curbs_geojson_path, output_geojson_path, street_cleaning_regex="Street Cleaning"):
    """
    Assigns regulation types to curb segments based on nearby parking signs.

    Args:
        signs_geojson_path (str): Path to the parking signs GeoJSON file.
        curbs_geojson_path (str): Path to the curb centerlines GeoJSON file.
        output_geojson_path (str): Path to save the updated curb centerlines GeoJSON.
        street_cleaning_regex (str): The exact string identifying street cleaning signs to exclude.
    """
    try:
        # --- 1. Load Data ---
        print("Loading data...")
        signs = gpd.read_file(signs_geojson_path)
        curbs = gpd.read_file(curbs_geojson_path)
        print(f"Loaded {len(signs)} signs and {len(curbs)} curb segments.")

        # --- Ensure CRS Match (optional but recommended) ---
        # If CRS don't match, reproject signs to curbs' CRS
        if signs.crs != curbs.crs:
            print(f"Warning: CRS mismatch. Reprojecting signs from {signs.crs} to {curbs.crs}")
            signs = signs.to_crs(curbs.crs)

        # --- Filter out 'Street Cleaning' signs ---
        print(f"Filtering out '{street_cleaning_regex}' signs...")
        relevant_signs = signs[~signs['regulation_type'].str.contains(street_cleaning_regex, na=False, case=False)].copy()
        print(f"{len(relevant_signs)} signs remaining after filtering.")

        if relevant_signs.empty:
            print("No relevant signs found after filtering. Cannot assign regulations.")
            # Save the original curbs data if no signs are relevant
            curbs['regulation_type'] = None
            curbs.to_file(output_geojson_path, driver='GeoJSON')
            print(f"Original curb data saved to {output_geojson_path}")
            return

        # --- 2. Snap Signs to Nearest Curb (Optimized) ---
        print("Snapping relevant signs to nearest curb segments...")
        # Use spatial index for faster nearest neighbor search
        curbs_sindex = curbs.sindex
        
        snapped_data = []
        for idx, sign in relevant_signs.iterrows():
            possible_matches_index = list(curbs_sindex.nearest(sign.geometry, num_results=1)) # Use num_results=1 for performance
            if not possible_matches_index:
                continue
                
            nearest_curb_idx = possible_matches_index[0] # Index within the original 'curbs' GeoDataFrame
            nearest_curb_geom = curbs.iloc[nearest_curb_idx].geometry
            
            # Find the point on the line closest to the sign
            snapped_point = nearest_points(sign.geometry, nearest_curb_geom)[1]
            
            snapped_data.append({
                'sign_index': idx,
                'curb_index': nearest_curb_idx, # Store original curb index
                'sign_regulation': sign['regulation_type'],
                'snapped_point_geom': snapped_point,
                'sign_geom': sign.geometry,
                'curb_geom': nearest_curb_geom
            })

        if not snapped_data:
            print("No signs could be snapped to curbs.")
            curbs['regulation_type'] = None
            curbs.to_file(output_geojson_path, driver='GeoJSON')
            print(f"Original curb data saved to {output_geojson_path}")
            return

        snapped_gdf = gpd.GeoDataFrame(snapped_data, geometry='snapped_point_geom', crs=curbs.crs)
        print(f"{len(snapped_gdf)} signs successfully snapped.")


        # --- 3. Determine Closest Sign to Start Point for Each Curb ---
        print("Determining closest sign to the start point for each curb...")
        curbs['regulation_type'] = None # Initialize regulation column

        # Group snapped signs by the curb they snapped to
        grouped_snaps = snapped_gdf.groupby('curb_index')

        assigned_count = 0
        for curb_idx, group in grouped_snaps:
            curb_geom = curbs.iloc[curb_idx].geometry
            if not isinstance(curb_geom, LineString) or len(curb_geom.coords) == 0:
                print(f"Warning: Curb index {curb_idx} has invalid geometry. Skipping.")
                continue

            start_point = Point(curb_geom.coords[0])

            # Calculate distance from each snapped sign's point on the curb to the curb's start point
            group['distance_to_start'] = group['snapped_point_geom'].distance(start_point)

            # Find the sign closest to the start point
            closest_sign_in_group = group.loc[group['distance_to_start'].idxmin()]

            # Assign regulation type
            curbs.loc[curb_idx, 'regulation_type'] = closest_sign_in_group['sign_regulation']
            assigned_count += 1
        
        print(f"Assigned regulations to {assigned_count} curbs based on closest sign to start point.")


        # --- 4 & 5. Propagate Regulations to Neighbors (Iterative) ---
        print("Propagating regulations to neighbors...")
        
        # Build adjacency list (which curbs touch which other curbs)
        # Note: This assumes segments that touch *at endpoints* are adjacent.
        adjacency = {idx: set() for idx in curbs.index}
        # Use spatial index for faster intersection checks
        # Buffer slightly to catch near-touching endpoints if needed
        BUFFER_DIST = 1e-6 # Small buffer, adjust based on CRS units and precision
        
        potential_neighbors = curbs.sindex.query(curbs.geometry.buffer(BUFFER_DIST), predicate='intersects')
        
        for i, j in zip(potential_neighbors[0], potential_neighbors[1]):
             if i != j: # Don't compare a curb with itself
                geom_i = curbs.iloc[i].geometry
                geom_j = curbs.iloc[j].geometry
                # Check for endpoint intersection (more robust than just 'intersects')
                if geom_i.boundary.intersects(geom_j.boundary):
                     adjacency[i].add(j)
                     adjacency[j].add(i)

        print("Built adjacency information.")

        iteration = 0
        max_iterations = len(curbs) # Failsafe to prevent infinite loops
        while iteration < max_iterations:
            print(f"Neighbor propagation iteration {iteration + 1}...")
            changes_made = False
            unassigned_curbs = curbs[curbs['regulation_type'].isna()]

            if unassigned_curbs.empty:
                print("All curbs assigned. Propagation complete.")
                break

            print(f"{len(unassigned_curbs)} curbs still unassigned.")

            for idx, curb in unassigned_curbs.iterrows():
                neighbor_regs = set()
                # Find neighbors using the precomputed adjacency list
                neighbors_indices = adjacency.get(idx, set())

                for neighbor_idx in neighbors_indices:
                    neighbor_reg = curbs.loc[neighbor_idx, 'regulation_type']
                    if pd.notna(neighbor_reg):
                        neighbor_regs.add(neighbor_reg)

                # Assign if exactly one unique regulation type found among neighbors
                if len(neighbor_regs) == 1:
                    assigned_reg = neighbor_regs.pop()
                    curbs.loc[idx, 'regulation_type'] = assigned_reg
                    print(f"  Assigned regulation '{assigned_reg}' to curb index {idx} from neighbor.")
                    changes_made = True

            iteration += 1
            if not changes_made:
                print("No further changes made in this iteration. Stopping propagation.")
                break
        
        if iteration == max_iterations and not curbs[curbs['regulation_type'].isna()].empty:
            print("Warning: Max iterations reached, some curbs may remain unassigned.")

        # --- 6. Save Output ---
        print(f"Saving updated curb data to {output_geojson_path}...")
        # Select only relevant columns if needed, or keep all
        # output_curbs = curbs[['geometry', 'regulation_type', 'label']] # Example selection
        curbs.to_file(output_geojson_path, driver='GeoJSON')
        print("Processing complete.")

    except Exception as e:
        print(f"An error occurred: {e}")
        import traceback
        traceback.print_exc()

# --- Usage Example ---
# Define file paths
signs_file = './data/regulations_categorized.geojson'
curbs_file = './data/labeled_curbs.geojson' # REPLACE with actual path to paste-2.txt content saved as .geojson
output_file = './data/curbs_with_regulations.geojson' # REPLACE with desired output path

# Ensure the input files exist before running
# import os
# if not os.path.exists(signs_file) or not os.path.exists(curbs_file):
#    print("Error: Input file(s) not found. Please check the paths.")
# else:
#    assign_curb_regulations(signs_file, curbs_file, output_file)
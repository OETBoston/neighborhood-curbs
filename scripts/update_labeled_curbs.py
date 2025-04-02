#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import json
import numpy as np
import geopandas as gpd
from shapely.geometry import Point, LineString
from scipy.spatial import cKDTree
import math
import os
import pandas as pd
from datetime import datetime

def haversine_distance(lon1, lat1, lon2, lat2):
    """
    Calculate the great circle distance between two points 
    on the earth (specified in decimal degrees).
    Returns distance in meters.
    """
    # Convert decimal degrees to radians
    lon1, lat1, lon2, lat2 = map(math.radians, [lon1, lat1, lon2, lat2])
    
    # Haversine formula
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    r = 6371000  # Radius of earth in meters
    return c * r

def calculate_distance(point1, point2):
    """
    Calculate distance between two points.
    point1 and point2 are tuples of (longitude, latitude).
    Returns distance in meters.
    """
    return haversine_distance(point1[0], point1[1], point2[0], point2[1])

def clean_regulation_type(reg_type):
    """
    Clean regulation type by removing control characters and trimming whitespace.
    Returns None for empty, nan, or invalid regulation types.
    """
    if pd.isna(reg_type) or reg_type == "nan" or reg_type == "":
        return None
    
    if not isinstance(reg_type, str):
        return None
        
    # Remove the control character and trim whitespace
    cleaned = reg_type.replace('\u001f', '').strip()
    
    # Return None if empty after cleaning
    return cleaned if cleaned else None

def assign_regulation_types(points_file, lines_file, output_file, max_distance=8, debug=True):
    """
    Assign regulation types from points to line segments based on proximity.
    
    Args:
        points_file: Path to regulations GeoJSON file
        lines_file: Path to curb segments GeoJSON file
        output_file: Path to save the processed GeoJSON file
        max_distance: Maximum distance (meters) to consider a point for assignment
        debug: Whether to print debug information
    """
    start_time = datetime.now()
    if debug:
        print(f"Process started at: {start_time}")
        print(f"Loading data from {points_file} and {lines_file}")
    
    # Load data with error handling
    try:
        with open(points_file, 'r', encoding='utf-8') as f:
            points_data = json.load(f)
            if debug:
                print(f"Loaded {len(points_data.get('features', []))} points features")
    except Exception as e:
        print(f"Error loading points file: {e}")
        return False
    
    try:
        with open(lines_file, 'r', encoding='utf-8') as f:
            lines_data = json.load(f)
            if debug:
                print(f"Loaded {len(lines_data.get('features', []))} line features")
    except Exception as e:
        print(f"Error loading lines file: {e}")
        return False
    
    # Create GeoDataFrames
    try:
        points_gdf = gpd.GeoDataFrame.from_features(points_data['features'])
        lines_gdf = gpd.GeoDataFrame.from_features(lines_data['features'])
    except Exception as e:
        print(f"Error creating GeoDataFrames: {e}")
        return False
    
    # Ensure we have the right CRS (WGS84)
    points_gdf.crs = "EPSG:4326"
    lines_gdf.crs = "EPSG:4326"
    
    # Clean and process regulation types
    if 'regulation_type' not in points_gdf.columns:
        print("Error: 'regulation_type' field missing from regulations data")
        return False
    
    # Clean regulation types
    points_gdf['clean_regulation_type'] = points_gdf['regulation_type'].apply(clean_regulation_type)
    
    # Filter out points with no valid regulation type BEFORE the matching operation
    valid_points_gdf = points_gdf[points_gdf['clean_regulation_type'].notna()].copy()
    
    if debug:
        print(f"Total regulation points: {len(points_gdf)}")
        print(f"Valid regulation points: {len(valid_points_gdf)}")
        print(f"Filtered out {len(points_gdf) - len(valid_points_gdf)} points with missing regulation types")
        if len(valid_points_gdf) > 0:
            print(f"Unique regulation types: {valid_points_gdf['clean_regulation_type'].unique().tolist()}")
    
    if len(valid_points_gdf) == 0:
        print("Error: No valid regulation points found after cleaning")
        return False
    
    # Extract point coordinates for KDTree
    point_coords = np.array([(point.x, point.y) for point in valid_points_gdf.geometry])
    regulation_types = valid_points_gdf['clean_regulation_type'].tolist()
    
    # Create KDTree for efficient nearest-neighbor search
    try:
        tree = cKDTree(point_coords)
    except Exception as e:
        print(f"Error creating KDTree: {e}")
        return False
    
    # Add new fields to lines_gdf if they don't exist
    if 'regulation_type' not in lines_gdf.columns:
        lines_gdf['regulation_type'] = None
    if 'assigned_automatically' not in lines_gdf.columns:
        lines_gdf['assigned_automatically'] = False
    if 'distance_to_sign' not in lines_gdf.columns:
        lines_gdf['distance_to_sign'] = None
    
    # Process each line segment
    assigned_count = 0
    total_segments = len(lines_gdf)
    
    for idx, line in lines_gdf.iterrows():
        try:
            # Get the start point of the line
            if isinstance(line.geometry, LineString):
                start_point = line.geometry.coords[0]
                
                # Find the nearest point with a valid regulation type
                distance, nearest_idx = tree.query(start_point, k=1)
                
                # Calculate actual distance in meters
                distance_meters = calculate_distance(start_point, point_coords[nearest_idx])
                
                # Assign regulation type if within max distance
                if distance_meters <= max_distance:
                    nearest_regulation = regulation_types[nearest_idx]
                    lines_gdf.at[idx, 'regulation_type'] = nearest_regulation
                    lines_gdf.at[idx, 'assigned_automatically'] = True
                    lines_gdf.at[idx, 'distance_to_sign'] = distance_meters
                    assigned_count += 1
        except Exception as e:
            if debug:
                print(f"Error processing line {idx}: {e}")
    
    # Print summary
    if debug:
        print(f"Processed {total_segments} line segments")
        print(f"Automatically assigned regulation types to {assigned_count} segments")
        print(f"Could not assign regulation types to {total_segments - assigned_count} segments")
    
    # Save the processed data
    try:
        processed_features = json.loads(lines_gdf.to_json())
        processed_geojson = {
            "type": "FeatureCollection",
            "features": processed_features['features']
        }
        
        with open(output_file, 'w') as f:
            json.dump(processed_geojson, f, indent=2)
            
        if debug:
            end_time = datetime.now()
            print(f"Results saved to {output_file}")
            print(f"Process completed in {(end_time - start_time).total_seconds()} seconds")
        
        return True
    except Exception as e:
        print(f"Error saving output file: {e}")
        return False

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description='Assign regulation types from points to line segments.')
    parser.add_argument('points_file', help='Path to regulations GeoJSON file')
    parser.add_argument('lines_file', help='Path to curb segments GeoJSON file')
    parser.add_argument('output_file', help='Path to save the processed GeoJSON file')
    parser.add_argument('--max-distance', type=float, default=8, help='Maximum distance (meters) to consider a point for assignment')
    parser.add_argument('--no-debug', action='store_true', help='Disable debug output')
    
    args = parser.parse_args()
    
    success = assign_regulation_types(
        args.points_file, 
        args.lines_file, 
        args.output_file,
        max_distance=args.max_distance,
        debug=not args.no_debug
    )
    
    if not success:
        exit(1)
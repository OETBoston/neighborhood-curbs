import json
import math
import os
from shapely.geometry import Point, LineString

def distance(point1, point2):
    """Calculate the Euclidean distance between two points."""
    return math.sqrt((point1[0] - point2[0])**2 + (point1[1] - point2[1])**2)

def find_nearest_segment(point, segments):
    """Find the nearest line segment to a point using manual distance calculation."""
    min_distance = float('inf')
    nearest_segment = None
    
    for segment in segments:
        coords = segment['geometry']['coordinates']
        
        # For each line segment, find minimum distance to the point
        min_segment_distance = float('inf')
        for i in range(len(coords) - 1):
            # Calculate distance from point to line segment
            segment_distance = point_to_segment_distance(
                point, 
                coords[i],
                coords[i+1]
            )
            min_segment_distance = min(min_segment_distance, segment_distance)
        
        if min_segment_distance < min_distance:
            min_distance = min_segment_distance
            nearest_segment = segment
    
    return nearest_segment, min_distance

def point_to_segment_distance(point, segment_start, segment_end):
    """Calculate distance from point to line segment using vector projection."""
    # Vector from segment start to end
    segment_vector = [
        segment_end[0] - segment_start[0],
        segment_end[1] - segment_start[1]
    ]
    
    # Vector from segment start to point
    point_vector = [
        point[0] - segment_start[0],
        point[1] - segment_start[1]
    ]
    
    # Length of the segment
    segment_length_squared = segment_vector[0]**2 + segment_vector[1]**2
    
    # Handle degenerate case of zero-length segment
    if segment_length_squared == 0:
        return math.sqrt(point_vector[0]**2 + point_vector[1]**2)
    
    # Calculate projection of point_vector onto segment_vector
    t = max(0, min(1, (point_vector[0]*segment_vector[0] + point_vector[1]*segment_vector[1]) / segment_length_squared))
    
    # Find nearest point on segment
    projection = [
        segment_start[0] + t * segment_vector[0],
        segment_start[1] + t * segment_vector[1]
    ]
    
    # Calculate distance from point to projection
    return distance(point, projection)

def project_point_to_line(point, line_coords):
    """Project a point onto a line and return the projected point and distance from start."""
    min_dist = float('inf')
    nearest_point = None
    t_value = 0  # Parameterized position along the line
    
    for i in range(len(line_coords) - 1):
        segment_start = line_coords[i]
        segment_end = line_coords[i+1]
        
        # Vector from segment start to end
        segment_vector = [
            segment_end[0] - segment_start[0],
            segment_end[1] - segment_start[1]
        ]
        
        # Vector from segment start to point
        point_vector = [
            point[0] - segment_start[0],
            point[1] - segment_start[1]
        ]
        
        # Length of the segment
        segment_length_squared = segment_vector[0]**2 + segment_vector[1]**2
        
        # Handle degenerate case of zero-length segment
        if segment_length_squared == 0:
            continue
        
        # Calculate projection of point_vector onto segment_vector
        t = max(0, min(1, (point_vector[0]*segment_vector[0] + point_vector[1]*segment_vector[1]) / segment_length_squared))
        
        # Find nearest point on segment
        projection = [
            segment_start[0] + t * segment_vector[0],
            segment_start[1] + t * segment_vector[1]
        ]
        
        # Calculate distance from point to projection
        dist = distance(point, projection)
        
        if dist < min_dist:
            min_dist = dist
            nearest_point = projection
            
            # Calculate distance from start of entire line to this projection
            # We need to add the lengths of previous segments
            distance_from_start = 0
            for j in range(i):
                distance_from_start += distance(line_coords[j], line_coords[j+1])
            
            # Add the distance along the current segment
            distance_from_start += distance(segment_start, projection)
    
    return nearest_point, min_dist, distance_from_start

def are_segments_adjacent(segment1, segment2):
    """Check if two line segments are adjacent based on their endpoints."""
    line1 = segment1['geometry']['coordinates']
    line2 = segment2['geometry']['coordinates']
    
    # Check if any endpoint of one segment matches an endpoint of the other
    start1, end1 = line1[0], line1[-1]
    start2, end2 = line2[0], line2[-1]
    
    # Using a small epsilon to account for floating-point imprecision
    epsilon = 1e-6
    
    return (distance(start1, start2) < epsilon or 
            distance(start1, end2) < epsilon or 
            distance(end1, start2) < epsilon or 
            distance(end1, end2) < epsilon)

def main():
    # Get current directory
    current_dir = os.getcwd()
    print(f"Current working directory: {current_dir}")
    
    try:
        # Load the GeoJSON data
        with open('paste.txt', 'r') as f:
            signs_data = json.load(f)
        
        with open('paste-2.txt', 'r') as f:
            segments_data = json.load(f)
        
        print("Files loaded successfully")
        
        # Extract the features
        signs = signs_data['features']
        segments = segments_data['features']
        
        print(f"Number of signs: {len(signs)}")
        print(f"Number of line segments: {len(segments)}")
        
        # Check the structure of the first sign and segment
        if signs:
            print("\nSample sign structure:")
            sign = signs[0]
            print(f"Geometry type: {sign['geometry']['type']}")
            print(f"Coordinates: {sign['geometry']['coordinates']}")
            print(f"Regulation type: {sign['properties'].get('regulation_type')}")
        
        if segments:
            print("\nSample segment structure:")
            segment = segments[0]
            print(f"Geometry type: {segment['geometry']['type']}")
            print(f"First few coordinates: {segment['geometry']['coordinates'][:3]}")
            print(f"Label: {segment['properties'].get('label')}")
        
        # Step 1: Filter out "Street Cleaning" signs and snap to nearest segments
        non_street_cleaning_signs = []
        for sign in signs:
            regulation_type = sign['properties'].get('regulation_type', '')
            if "Street Cleaning" not in str(regulation_type):
                non_street_cleaning_signs.append(sign)
        
        print(f"\nFiltered signs (excluding Street Cleaning): {len(non_street_cleaning_signs)}")
        
        # Map signs to segments
        sign_segment_mapping = {}
        for i, sign in enumerate(non_street_cleaning_signs):
            sign_point = sign['geometry']['coordinates']
            
            # Debug info
            if i < 3:  # Just print first 3 for debugging
                print(f"Processing sign {i}: Point {sign_point}")
            
            nearest_segment, _ = find_nearest_segment(sign_point, segments)
            
            if nearest_segment:
                segment_id = nearest_segment['properties']['label']
                line_coords = nearest_segment['geometry']['coordinates']
                
                # Use our custom projection function
                _, _, dist_from_start = project_point_to_line(sign_point, line_coords)
                
                if segment_id not in sign_segment_mapping:
                    sign_segment_mapping[segment_id] = []
                
                sign_segment_mapping[segment_id].append({
                    'sign': sign,
                    'distance_from_start': dist_from_start
                })
        
        print(f"\nSegments with assigned signs: {len(sign_segment_mapping)}")
        
        # Step 3: Assign regulation type to each segment based on closest sign
        segment_regulation = {}
        for segment in segments:
            segment_id = segment['properties']['label']
            
            if segment_id in sign_segment_mapping and sign_segment_mapping[segment_id]:
                # Sort signs by distance from segment start
                sorted_signs = sorted(sign_segment_mapping[segment_id], key=lambda x: x['distance_from_start'])
                closest_sign = sorted_signs[0]['sign']
                regulation_type = closest_sign['properties'].get('regulation_type', 'Unknown')
                segment_regulation[segment_id] = regulation_type
            else:
                segment_regulation[segment_id] = None
        
        # Count initial assignments
        assigned_count = sum(1 for reg in segment_regulation.values() if reg is not None)
        print(f"\nInitial segment assignments: {assigned_count} out of {len(segments)}")
        
        # Step 4 & 5: Propagate regulation types to unassigned segments
        changed = True
        iteration_count = 0
        max_iterations = 100  # Prevent infinite loops
        
        while changed and iteration_count < max_iterations:
            changed = False
            iteration_count += 1
            
            for segment in segments:
                segment_id = segment['properties']['label']
                
                if segment_regulation[segment_id] is None:
                    # Find adjacent segments
                    for other_segment in segments:
                        other_id = other_segment['properties']['label']
                        
                        if segment_id != other_id and are_segments_adjacent(segment, other_segment):
                            other_regulation = segment_regulation[other_id]
                            
                            if other_regulation is not None:
                                segment_regulation[segment_id] = other_regulation
                                changed = True
                                break
        
        # Count final assignments
        final_assigned_count = sum(1 for reg in segment_regulation.values() if reg is not None)
        print(f"\nFinal segment assignments after {iteration_count} iterations: {final_assigned_count} out of {len(segments)}")
        
        # Update the segments data with regulation types
        for segment in segments:
            segment_id = segment['properties']['label']
            regulation_type = segment_regulation[segment_id] or 'Unknown'
            # Clean up the regulation type (removing control characters)
            if isinstance(regulation_type, str):
                regulation_type = regulation_type.replace('\u001f', '')
            segment['properties']['regulation_type'] = regulation_type
        
        # Create the output GeoJSON
        output_data = {
            "type": "FeatureCollection",
            "features": segments
        }
        
        # Output the result
        with open('updated_segments.json', 'w') as f:
            json.dump(output_data, f, indent=2)
        
        print("\nUpdated GeoJSON has been saved to 'updated_segments.json'")
    
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
import json
import os

def clean_geojson(input_file, output_file):
    """
    Removes features from a GeoJSON file where the mutcd_code_field is empty or None.
    
    Args:
        input_file (str): Path to the input GeoJSON file
        output_file (str): Path to save the cleaned GeoJSON file
    """
    # Read the input GeoJSON file
    with open(input_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Count original features
    original_count = len(data['features'])
    
    # Filter out features with empty mutcd_code_field
    data['features'] = [
        feature for feature in data['features'] 
        if feature['properties'].get('mutcd_code_field') and 
        feature['properties']['mutcd_code_field'].strip() != "" and
        feature['properties']['mutcd_code_field'].lower() != "none"
    ]
    
    # Count remaining features
    remaining_count = len(data['features'])
    removed_count = original_count - remaining_count
    
    # Write the cleaned data to the output file
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
    
    return {
        'original_count': original_count,
        'remaining_count': remaining_count,
        'removed_count': removed_count
    }

def main():
    # Get the input file path
    input_file = input("Enter the path to your GeoJSON file: ")
    
    # Create the output file path
    file_name, file_ext = os.path.splitext(input_file)
    output_file = f"{file_name}_cleaned{file_ext}"
    
    # Clean the GeoJSON file
    try:
        result = clean_geojson(input_file, output_file)
        print("\nGeoJSON cleaning completed successfully!")
        print(f"Original features: {result['original_count']}")
        print(f"Features removed: {result['removed_count']}")
        print(f"Remaining features: {result['remaining_count']}")
        print(f"\nCleaned file saved as: {output_file}")
    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    main()
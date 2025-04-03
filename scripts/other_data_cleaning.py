import json

def clean_geojson(input_file, output_file):
    # Load the GeoJSON file
    with open(input_file, 'r') as f:
        data = json.load(f)
    
    # Get the original number of features
    original_count = len(data['features'])
    print(f"Original number of features: {original_count}")
    
    # Filter out features with regulation_type = "Other"
    data['features'] = [
        feature for feature in data['features'] 
        if feature['properties']['regulation_type'] != "\u001fOther\u001f"
    ]
    
    # Update remaining features
    for feature in data['features']:
        # Change "ParkBoston/Metered" to "Metered Parking"
        if feature['properties']['regulation_type'] == "\u001fParkBoston/Metered\u001f":
            feature['properties']['regulation_type'] = "Metered Parking"
            
        # Change "Tow Zone: Street Cleaning/Snow Emergency" to "Street Cleaning/Snow Emergency"
        elif feature['properties']['regulation_type'] == "\u001fTow Zone: Street Cleaning/Snow Emergency\u001f":
            feature['properties']['regulation_type'] = "Street Cleaning/Snow Emergency"
    
    # Get the new count of features
    new_count = len(data['features'])
    print(f"Features after removing 'Other' type: {new_count}")
    print(f"Removed {original_count - new_count} features")
    
    # Write the cleaned data to the output file
    with open(output_file, 'w') as f:
        json.dump(data, f, indent=2)
    
    print(f"Cleaned GeoJSON saved to {output_file}")
    
    # Print summary of regulation types in the cleaned data
    regulation_counts = {}
    for feature in data['features']:
        reg_type = feature['properties']['regulation_type']
        regulation_counts[reg_type] = regulation_counts.get(reg_type, 0) + 1
    
    print("\nRegulation types in cleaned data:")
    for reg_type, count in regulation_counts.items():
        print(f"  {reg_type}: {count} features")

if __name__ == "__main__":
    # Replace 'input.geojson' with your actual input file name if different
    input_file = "./data/regulations_categorized_w_TZSnow.geojson"
    output_file = "./data/regulations_categorized.geojson"
    
    clean_geojson(input_file, output_file)
# Database Schema
> **Related documents:** [README](../README.md) | [Architecture](../docs/Architecture.md) | [Code Reference](../docs/Code_Reference.md)
DB Name: crime_data
Table Name: crime_data

column name, data type, rules
csv_index, varchar
id, varchar, not null
case_number, varchar, not nul
date, timestamp without time zone, not null
block, varchar, not null
primary_type, varchar, not null
description, varchar, not null
location_description, varchar
arrest, bool, not null
domestic, bool, not null
beat, varchar
ward, varchar
community_area, varchar, not null
fbi_code, varchar, not null
x_coordinate, float4
y_coordinate, float4
year, varchar, not null
updated_on, timestamp without time zone
latitude, float4
longitude, float4
iucr, varchar
district, varchar

Command to use when copying csv file to db schema : 
psql -U username -d crime_data -c "\copy crime_data (
  csv_index,
  id,
  case_number,
  \"date\",
  block,
  iucr,
  primary_type,
  description,
  location_description,
  arrest,
  domestic,
  beat,
  district,
  ward,
  community_area,
  fbi_code,
  x_coordinate,
  y_coordinate,
  year,
  updated_on,
  latitude,
  longitude
) FROM '/path/to/crime.csv'
WITH (FORMAT csv, HEADER true);"

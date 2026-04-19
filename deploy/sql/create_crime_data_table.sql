CREATE TABLE IF NOT EXISTS crime_data (
  csv_index text,
  id text NOT NULL,
  case_number text NOT NULL,
  "date" timestamp without time zone NOT NULL,
  block text NOT NULL,
  iucr text,
  primary_type text NOT NULL,
  description text NOT NULL,
  location_description text,
  arrest boolean NOT NULL,
  domestic boolean NOT NULL,
  beat text,
  district text,
  ward text,
  community_area text NOT NULL,
  fbi_code text NOT NULL,
  x_coordinate real,
  y_coordinate real,
  year text NOT NULL,
  updated_on timestamp without time zone,
  latitude real,
  longitude real
);

CREATE INDEX IF NOT EXISTS idx_crime_data_date ON crime_data ("date");
CREATE INDEX IF NOT EXISTS idx_crime_data_community_area ON crime_data (community_area);
CREATE INDEX IF NOT EXISTS idx_crime_data_beat ON crime_data (beat);
CREATE INDEX IF NOT EXISTS idx_crime_data_district ON crime_data (district);

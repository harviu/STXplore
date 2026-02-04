import { useState, useEffect, useRef } from 'react'
import { select } from 'https://esm.sh/d3-selection';
import { geoPath, geoEquirectangular, geoMercator } from 'https://esm.sh/d3-geo';
import comm from '../../data/Chicago-Data/Boundries/CommAreas_20250306/chicagoComm.json';
import beat from '../../data/Chicago-Data/Boundries/PoliceBeatDec2012_20250225/beats.json';
import district from '../../data/Chicago-Data/Boundries/PoliceDistrictDec2012_20250128/district.json';

function Map() {
  const svgRef = useRef();
  const maps = {c: comm, b:beat, d:district}
  const [selectedMap, setSelectedMap] = useState('c');

  const mapChange = (event) => {
    setSelectedMap(event.target.value);
  }


  useEffect(() => {
    if(!svgRef.current) return;
    const svg = select(svgRef.current);
    const g = svg.select('.map');

    const projection = geoMercator().fitSize([800, 600], maps[selectedMap]);
    const geoGenerator = geoPath().projection(projection);

    g.selectAll('path').remove();

    g.selectAll('path')
      .data(maps[selectedMap].features)
      .join('path')
      .attr('d', geoGenerator)
      .attr('fill', '#ccc')
      .attr('stroke', '#fff')
      .attr('stroke-width', 0.5)
      .on('mouseover', function(event, d) {
        console.log("Hovering over:", event.currentTarget);
        select(event.currentTarget).attr('fill', '#e72');
      })
      .on('mouseout', function(event, d) {
        select(event.currentTarget).attr('fill', '#ccc');
      });

  }, [selectedMap]);


  return (
    <>
      <div>
        <input type="radio" id="Community" name="Maps" value='c' checked={selectedMap === 'c'} onChange={mapChange}/>
        <label htmlFor="Community">Community Area Map</label>
      </div>
      <div>
        <input type="radio" id="Beats" name="Maps" value='b' checked={selectedMap === 'b'} onChange={mapChange}/>
        <label htmlFor="Beats">Police Beats Map</label>
      </div>
      <div>
        <input type="radio" id="Districts" name="Maps" value='d' checked={selectedMap === 'd'} onChange={mapChange}/>
        <label htmlFor="Districts">Police Districts Map</label>
      </div>
      <div id="content">
        <svg ref={svgRef} width="800" height="600">
          <g className="map"></g>
        </svg>
      </div>
    </>
  )
}

export default Map

import { useState, useEffect, useRef } from 'react'
import { select } from 'https://esm.sh/d3-selection';
import { geoPath, geoEquirectangular, geoMercator } from 'https://esm.sh/d3-geo';
import comm from '../../data/Chicago-Data/Boundries/CommAreas_20250306/chicagoComm.json';
import beat from '../../data/Chicago-Data/Boundries/PoliceBeatDec2012_20250225/beats.json';
import district from '../../data/Chicago-Data/Boundries/PoliceDistrictDec2012_20250128/district.json';
import './SourceMap.css';

function SourceMap() {
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

    const projection = geoMercator().fitSize([600, 600], maps[selectedMap]);
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
        select(event.currentTarget).attr('fill', '#e72');
      })
      .on('mouseout', function(event, d) {
        select(event.currentTarget).attr('fill', '#ccc');
      });

  }, [selectedMap]);


  return (
    <>
      <div className="source">
        <h2>Source</h2>
        <div>
          <input type="radio" id="Community" name="SMaps" value='c' checked={selectedMap === 'c'} onChange={mapChange}/>
          <label htmlFor="Community">Community Area Map</label>
          <span>    </span>
          <input type="radio" id="Beats" name="SMaps" value='b' checked={selectedMap === 'b'} onChange={mapChange}/>
          <label htmlFor="Beats">Police Beats Map</label>
          <span>    </span>
          <input type="radio" id="Districts" name="SMaps" value='d' checked={selectedMap === 'd'} onChange={mapChange}/>
          <label htmlFor="Districts">Police Districts Map</label>
        </div>
        <div id="content">
          <svg ref={svgRef} width="600" height="600">
            <g className="map"></g>
          </svg>
        </div>
      </div>
    </>
  )
}

export default SourceMap

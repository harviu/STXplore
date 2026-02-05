import { useState, useEffect, useRef } from 'react'
import { select } from 'https://esm.sh/d3-selection';
import { geoPath, geoEquirectangular, geoMercator } from 'https://esm.sh/d3-geo';
import comm from '../../data/Chicago-Data/Boundries/CommAreas_20250306/chicagoComm.json';
import beat from '../../data/Chicago-Data/Boundries/PoliceBeatDec2012_20250225/beats.json';
import district from '../../data/Chicago-Data/Boundries/PoliceDistrictDec2012_20250128/district.json';
import './TargetMap.css';

function TargetMap() {
  const svgRef = useRef();
  const maps = {tc: comm, tb:beat, td:district}
  const [selectedMap, setSelectedMap] = useState('tc');

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
      <div className="target">
        <h2>Target</h2>
        <div>
          <input type="radio" id="TCommunity" name="TMaps" value='tc' checked={selectedMap === 'tc'} onChange={mapChange}/>
          <label htmlFor="TCommunity">Community Area Map</label>
          <span>    </span>
          <input type="radio" id="TBeats" name="TMaps" value='tb' checked={selectedMap === 'tb'} onChange={mapChange}/>
          <label htmlFor="TBeats">Police Beats Map</label>
          <span>    </span>
          <input type="radio" id="TDistricts" name="TMaps" value='td' checked={selectedMap === 'td'} onChange={mapChange}/>
          <label htmlFor="TDistricts">Police Districts Map</label>
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

export default TargetMap

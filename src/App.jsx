import { useState, useEffect, useRef } from 'react'
import { select } from 'https://esm.sh/d3-selection';
import './App.css'
import TargetMap from './components/TargetMap.jsx'
import SourceMap from './components/SourceMap.jsx'

function App() {

  return (
    <>
      <h1>Chicago Map</h1>
      <div className="maps">
        <SourceMap />
        <TargetMap />
      </div>
    </>
  )
}

export default App

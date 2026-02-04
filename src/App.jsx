import { useState, useEffect, useRef } from 'react'
import { select } from 'https://esm.sh/d3-selection';
import './App.css'
import Map from './components/Map.jsx'

function App() {

  return (
    <>
      <h1>Chicago Map</h1>
      <Map />
    </>
  )
}

export default App

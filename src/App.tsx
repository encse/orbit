/* eslint-disable */
import * as THREE from 'three'
import * as React from 'react'
import { useRef, useState, useEffect, useMemo, useLayoutEffect } from 'react'
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber'
import { Image, useAspect, useTexture, Line, Points, Text } from '@react-three/drei'
import { Vector2, Vector3, Color, ColorRepresentation } from 'three';
import { Sat, SatMap, calculate_footprint } from './gpredict/satmap'



function Box(props: JSX.IntrinsicElements['mesh']) {
  // This reference will give us direct access to the THREE.Mesh object
  const ref = useRef<THREE.Mesh>(null!)
  // Hold state for hovered and clicked events
  const [hovered, hover] = useState(false)
  const [clicked, click] = useState(false)
  // Rotate mesh every frame, this is outside of React without overhead
  useFrame((state, delta) => (ref.current.rotation.x += 0.01))

  return (
    <mesh
      {...props}
      ref={ref}
      scale={clicked ? 1.5 : 1}
      onClick={(event) => click(!clicked)}
      onPointerOver={(event) => hover(true)}
      onPointerOut={(event) => hover(false)}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={hovered ? 'hotpink' : 'orange'} />
    </mesh>
  )
}

function Footprint(props: { dlon: number, dlat: number, footprint: number, color?: string }) {
  const { width: w, height: h } = useThree((state) => state.viewport)

  const satmap: SatMap = {
    left_side_lon: -180,
    width: w,
    height: h,
    x0: 0,
    y0: 0,
  }

  const sat: Sat = {
    ssplon: props.dlon,
    ssplat: props.dlat,
    footprint: props.footprint,
  }

  const pointss = calculate_footprint(satmap, sat);
  let line1: [number, number][] = pointss[0].map(p => [p.x - w / 2, h / 2 - p.y]);
  let line2: [number, number][] = pointss[1].map(p => [p.x - w / 2, h / 2 - p.y]);

  return (
    <mesh>
      {line1.length > 0 && <Line lineWidth={2} points={line1} wireframe={true} color={props.color} />}
      {line2.length > 0 && <Line lineWidth={2} points={line2}  wireframe={true} color={props.color} />}
    </mesh>
  );
}

function Grid(props: { dlat: number, dlon: number, color?: string }) {
  const { width: w, height: h } = useThree((state) => state.viewport)
  const lines = [];
  const labels = [];
  const dx = w / (360 / props.dlon);
  const dy = h / (180 / props.dlat);

  for (let x = -180 / props.dlon; x <= 180 / props.dlon; x++) {
    lines.push(<Line points={[[x * dx, -h / 2, 0], [x * dx, h / 2, 0]]} color={props.color} />);
    labels.push(<Text
      color={props.color}
      position={[x * dx, -h / 2, 0]}
      anchorX="right"
      anchorY="bottom"
      fontSize={0.15}
    >{x * props.dlon}º&nbsp;</Text>)
  }

  for (let y = -90 / props.dlat; y <= 90 / props.dlat; y++) {
    lines.push(<Line points={[[-w / 2, y * dy, 0], [w / 2, y * dy, 0]]} color={props.color} />);

    labels.push(<Text
      color={props.color}
      position={[-w / 2, -y * dy, 0]}
      anchorX="left"
      anchorY="bottom"
      fontSize={0.15}
    >{y * props.dlat}º</Text>)

  }

  return (
    <mesh>
      {labels}
      {lines}
    </mesh>
  );
}


function Map(props: { imagePath: string }) {
  const texture = useLoader(THREE.TextureLoader, props.imagePath);
  const { width: w, height: h } = useThree((state) => state.viewport);


  const [position, setPosition] = useState({ lat: 0, lon: 0 });
  const [direction, setDirection] = useState({ lat: 1, lon: 1 });

  useEffect(() => {
    const animationInterval = setInterval(() => {
      setPosition(prevPosition => {
        const newPosition = {
          lat: prevPosition.lat + direction.lat,
          lon: prevPosition.lon + direction.lon,
        };

        // Reverse direction if the ball hits the edge of the screen
        if (newPosition.lat <= -80 || newPosition.lat >= 80) {
          setDirection(prevDirection => ({ ...prevDirection, lat: -prevDirection.lat }));
        }

        if (newPosition.lon <= -180) {
          newPosition.lon += 360;
        } else if (newPosition.lon >= 180){
          newPosition.lon -= 360;
        }

        // if (newPosition.lon <= -180|| newPosition.lon >= 180) {
        //   setDirection(prevDirection => ({ ...prevDirection, lon: -prevDirection.lon }));
        // }

        return newPosition;
      });
    }, 16); // Update every 16ms for ~60fps

    return () => clearInterval(animationInterval);
  }, [direction]);

  console.log(position);

  return (
    <mesh>
      <planeBufferGeometry attach="geometry" args={[w, h]} />
      <meshBasicMaterial attach="material" map={texture} />
      {<Grid dlat={22.5} dlon={30} color='#777' />}
      <Footprint dlon={position.lon} dlat={position.lat} footprint={2000} color='#FFF' />
    </mesh>
  )
}

export default function App() {
  return (
    <Canvas >
      <ambientLight intensity={1} />
      <Map imagePath='nasa-topo_2048.jpg' />
    </Canvas>
  )
}

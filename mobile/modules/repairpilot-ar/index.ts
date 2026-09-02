import {requireOptionalNativeModule} from 'expo-modules-core';

export type RepairPilotARSnapshot={
  image_base64:string;
  mime_type:string;
  width:number;
  height:number;
  depth_available?:boolean;
  depth_width?:number;
  depth_height?:number;
};

export type RepairPilotARNativeModule={
  isSupported:()=>Promise<boolean>;
  isDepthSupported:()=>Promise<boolean>;
  startSession:()=>Promise<{running:boolean;depth?:boolean}>;
  stopSession:()=>Promise<void>;
  captureTargetSnapshot:()=>Promise<RepairPilotARSnapshot>;
  captureLiveSnapshot:()=>Promise<RepairPilotARSnapshot>;
  anchorAtFrozenDepthPoint:(point:{x:number;y:number})=>Promise<{id:string;confidence:number;position:{x:number;y:number;z:number}}>;
  anchorAtImagePoint:(point:{x:number;y:number},depthMeters:number)=>Promise<{id:string;confidence?:number;position:{x:number;y:number;z:number}}>;
  projectAnchor:(id:string,viewport:{width:number;height:number})=>Promise<{visible:boolean;x:number;y:number;depth:number}>;
  removeAnchor:(id:string)=>Promise<void>;
  clearAnchors:()=>Promise<void>;
};

export default requireOptionalNativeModule<RepairPilotARNativeModule>('RepairPilotAR');

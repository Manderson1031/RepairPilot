import {requireOptionalNativeModule} from 'expo-modules-core';

export type RepairPilotARNativeModule={
  isSupported:()=>Promise<boolean>;
  startSession:()=>Promise<{running:boolean}>;
  stopSession:()=>Promise<void>;
  anchorAtImagePoint:(point:{x:number;y:number},depthMeters:number)=>Promise<{id:string;position:{x:number;y:number;z:number}}>;
  projectAnchor:(id:string,viewport:{width:number;height:number})=>Promise<{visible:boolean;x:number;y:number;depth:number}>;
  removeAnchor:(id:string)=>Promise<void>;
  clearAnchors:()=>Promise<void>;
};

export default requireOptionalNativeModule<RepairPilotARNativeModule>('RepairPilotAR');

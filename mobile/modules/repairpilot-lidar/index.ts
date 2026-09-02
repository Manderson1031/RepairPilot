import {requireOptionalNativeModule} from 'expo-modules-core';

export type LidarPoint={x:number;y:number};
export type LidarPointMeasurement={
  distance_mm:number;
  confidence:number;
  depth_m:{start:number;end:number};
};
export type LidarDepthSnapshot={
  image_base64:string;
  mime_type:string;
  width:number;
  height:number;
  depth_width:number;
  depth_height:number;
};

export type RepairPilotLidarNative={
  isSupported:()=>Promise<boolean>;
  startSession:()=>Promise<{running:boolean}>;
  stopSession:()=>Promise<void>;
  captureDepthSnapshot:()=>Promise<LidarDepthSnapshot>;
  measureBetweenPoints:(start:LidarPoint,end:LidarPoint)=>Promise<LidarPointMeasurement>;
};

export default requireOptionalNativeModule<RepairPilotLidarNative>('RepairPilotLidar');

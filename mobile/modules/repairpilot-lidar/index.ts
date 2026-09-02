import {requireOptionalNativeModule} from 'expo-modules-core';

export type LidarPoint={x:number;y:number};
export type LidarPointMeasurement={
  distance_mm:number;
  confidence:number;
  depth_m:{start:number;end:number};
};

export type RepairPilotLidarNative={
  isSupported:()=>Promise<boolean>;
  startSession:()=>Promise<{running:boolean}>;
  stopSession:()=>Promise<void>;
  measureBetweenPoints:(start:LidarPoint,end:LidarPoint)=>Promise<LidarPointMeasurement>;
};

export default requireOptionalNativeModule<RepairPilotLidarNative>('RepairPilotLidar');

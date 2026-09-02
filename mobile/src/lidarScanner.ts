import {NativeModules,Platform} from 'react-native';

export type LidarMeasurement={
  diameter_mm?:number|null;
  length_mm?:number|null;
  width_mm?:number|null;
  height_mm?:number|null;
  thread_pitch_mm?:number|null;
};

export type LidarCaptureResult={
  available:boolean;
  confidence:number;
  source:'arkit_lidar'|'none';
  measurements:LidarMeasurement;
  reason?:string;
};

type NativeRepairPilotLidar={
  isSupported:()=>Promise<boolean>;
  captureHardware:()=>Promise<{
    confidence:number;
    measurements:LidarMeasurement;
  }>;
};

const nativeModule:NativeRepairPilotLidar|undefined=(NativeModules as any).RepairPilotLidar;

export async function lidarAvailability():Promise<{available:boolean;reason?:string}>{
  if(Platform.OS!=='ios')return {available:false,reason:'LiDAR hardware scanning is currently planned for supported iPhone and iPad models.'};
  if(!nativeModule)return {available:false,reason:'The RepairPilot LiDAR native module is not included in this build yet.'};
  try{
    const supported=await nativeModule.isSupported();
    return supported?{available:true}:{available:false,reason:'This Apple device does not report supported ARKit scene-depth hardware.'};
  }catch{
    return {available:false,reason:'LiDAR capability could not be verified on this device.'};
  }
}

export async function captureLidarHardware():Promise<LidarCaptureResult>{
  const availability=await lidarAvailability();
  if(!availability.available||!nativeModule){
    return {available:false,confidence:0,source:'none',measurements:{},reason:availability.reason};
  }
  try{
    const result=await nativeModule.captureHardware();
    const confidence=Number.isFinite(result?.confidence)?Math.max(0,Math.min(1,result.confidence)):0;
    return {available:true,confidence,source:'arkit_lidar',measurements:result?.measurements||{}};
  }catch(e:any){
    return {available:true,confidence:0,source:'arkit_lidar',measurements:{},reason:e?.message||'LiDAR capture failed.'};
  }
}

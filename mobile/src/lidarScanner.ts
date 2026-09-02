import {Platform} from 'react-native';
import {requireOptionalNativeModule} from 'expo-modules-core';

export type LidarMeasurement={
  diameter_mm?:number|null;
  length_mm?:number|null;
  width_mm?:number|null;
  height_mm?:number|null;
  thread_pitch_mm?:number|null;
};

export type LidarPoint={x:number;y:number};
export type LidarSnapshot={
  imageUri:string;
  width:number;
  height:number;
  depthWidth:number;
  depthHeight:number;
};
export type LidarPointMeasurement={
  distance_mm:number;
  confidence:number;
  depth_m:{start:number;end:number};
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
  startSession:()=>Promise<{running:boolean}>;
  stopSession:()=>Promise<void>;
  captureDepthSnapshot:()=>Promise<{
    image_base64:string;
    mime_type:string;
    width:number;
    height:number;
    depth_width:number;
    depth_height:number;
  }>;
  measureBetweenPoints:(start:LidarPoint,end:LidarPoint)=>Promise<LidarPointMeasurement>;
};

const nativeModule=requireOptionalNativeModule<NativeRepairPilotLidar>('RepairPilotLidar');

export async function lidarAvailability():Promise<{available:boolean;reason?:string}>{
  if(Platform.OS!=='ios')return {available:false,reason:'LiDAR hardware scanning is currently supported only on compatible iPhone and iPad models.'};
  if(!nativeModule)return {available:false,reason:'This build does not include the RepairPilot LiDAR native module.'};
  try{
    const supported=await nativeModule.isSupported();
    return supported?{available:true}:{available:false,reason:'This Apple device does not report supported ARKit scene-depth hardware.'};
  }catch{
    return {available:false,reason:'LiDAR capability could not be verified on this device.'};
  }
}

export async function startLidarSession():Promise<void>{
  if(!nativeModule)throw new Error('LiDAR native module is unavailable in this build.');
  await nativeModule.startSession();
}

export async function stopLidarSession():Promise<void>{
  if(nativeModule)await nativeModule.stopSession();
}

export async function captureLidarSnapshot():Promise<LidarSnapshot>{
  if(!nativeModule)throw new Error('LiDAR native module is unavailable in this build.');
  await nativeModule.startSession();
  const snapshot=await nativeModule.captureDepthSnapshot();
  return {
    imageUri:`data:${snapshot.mime_type||'image/jpeg'};base64,${snapshot.image_base64}`,
    width:snapshot.width,
    height:snapshot.height,
    depthWidth:snapshot.depth_width,
    depthHeight:snapshot.depth_height,
  };
}

export async function measureLidarPoints(start:LidarPoint,end:LidarPoint):Promise<LidarPointMeasurement>{
  if(!nativeModule)throw new Error('LiDAR native module is unavailable in this build.');
  const result=await nativeModule.measureBetweenPoints(start,end);
  return {
    distance_mm:Number(result.distance_mm),
    confidence:Math.max(0,Math.min(1,Number(result.confidence)||0)),
    depth_m:{start:Number(result.depth_m?.start)||0,end:Number(result.depth_m?.end)||0},
  };
}

// Backward-compatible capability result for existing scanner UI while the
// interactive two-point LiDAR measurement workflow is being used for actual dimensions.
export async function captureLidarHardware():Promise<LidarCaptureResult>{
  const availability=await lidarAvailability();
  if(!availability.available){
    return {available:false,confidence:0,source:'none',measurements:{},reason:availability.reason};
  }
  try{
    await captureLidarSnapshot();
    return {
      available:true,
      confidence:0,
      source:'arkit_lidar',
      measurements:{},
      reason:'LiDAR depth frame captured. Select two points on the frozen depth-aligned image to obtain a physical measurement.'
    };
  }catch(e:any){
    return {available:true,confidence:0,source:'arkit_lidar',measurements:{},reason:e?.message||'LiDAR capture failed.'};
  }
}

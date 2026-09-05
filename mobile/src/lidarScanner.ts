import {Platform} from 'react-native';
import RepairPilotLidarNative,{LidarPoint,LidarPointMeasurement} from '../modules/repairpilot-lidar';

export type LidarMeasurement={
  diameter_mm?:number|null;
  length_mm?:number|null;
  width_mm?:number|null;
  height_mm?:number|null;
  thread_pitch_mm?:number|null;
};

export type {LidarPoint,LidarPointMeasurement};
export type LidarSnapshot={
  imageUri:string;
  width:number;
  height:number;
  depthWidth:number;
  depthHeight:number;
};

export type LidarCaptureResult={
  available:boolean;
  confidence:number;
  source:'arkit_lidar'|'none';
  measurements:LidarMeasurement;
  reason?:string;
};

export type AutoHardwareCapture={
  imageBase64:string;
  mimeType:string;
  width:number;
  height:number;
  confidence:number;
  measurements:LidarMeasurement;
};

const nativeModule=RepairPilotLidarNative;

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
  return {imageUri:`data:${snapshot.mime_type||'image/jpeg'};base64,${snapshot.image_base64}`,width:snapshot.width,height:snapshot.height,depthWidth:snapshot.depth_width,depthHeight:snapshot.depth_height};
}

export async function autoCaptureHardwareWithLidar():Promise<AutoHardwareCapture>{
  if(!nativeModule)throw new Error('LiDAR native module is unavailable in this build.');
  await nativeModule.startSession();
  try{
    // Give ARKit a brief moment to stabilize tracking/depth before the automatic capture.
    await new Promise(resolve=>setTimeout(resolve,900));
    const capture=await nativeModule.autoCaptureCenteredObject();
    return {
      imageBase64:capture.image_base64,
      mimeType:capture.mime_type||'image/jpeg',
      width:Number(capture.width)||0,
      height:Number(capture.height)||0,
      confidence:Math.max(0,Math.min(1,Number(capture.confidence)||0)),
      measurements:{
        width_mm:Number(capture.measurements?.width_mm)||null,
        height_mm:Number(capture.measurements?.height_mm)||null,
      },
    };
  }finally{
    await nativeModule.stopSession().catch(()=>{});
  }
}

export async function measureLidarPoints(start:LidarPoint,end:LidarPoint):Promise<LidarPointMeasurement>{
  if(!nativeModule)throw new Error('LiDAR native module is unavailable in this build.');
  const result=await nativeModule.measureBetweenPoints(start,end);
  return {distance_mm:Number(result.distance_mm),confidence:Math.max(0,Math.min(1,Number(result.confidence)||0)),depth_m:{start:Number(result.depth_m?.start)||0,end:Number(result.depth_m?.end)||0}};
}

export async function captureLidarHardware():Promise<LidarCaptureResult>{
  const availability=await lidarAvailability();
  if(!availability.available)return {available:false,confidence:0,source:'none',measurements:{},reason:availability.reason};
  try{
    const capture=await autoCaptureHardwareWithLidar();
    return {available:true,confidence:capture.confidence,source:'arkit_lidar',measurements:capture.measurements,reason:'Automatic centered-object camera and LiDAR capture completed.'};
  }catch(e:any){
    return {available:true,confidence:0,source:'arkit_lidar',measurements:{},reason:e?.message||'LiDAR capture failed.'};
  }
}

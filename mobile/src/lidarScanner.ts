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
  longAxisMm:number|null;
  shortAxisMm:number|null;
  depthMm:number|null;
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
    // Give ARKit enough time to settle after the live preview releases the camera.
    await new Promise(resolve=>setTimeout(resolve,1100));
    const capture=await nativeModule.autoCaptureCenteredObject();
    const longAxis=Number(capture.measurements?.long_axis_mm)||null;
    const shortAxis=Number(capture.measurements?.short_axis_mm)||null;
    const depth=Number(capture.measurements?.depth_mm)||null;
    return {
      imageBase64:capture.image_base64,
      mimeType:capture.mime_type||'image/jpeg',
      width:Number(capture.width)||0,
      height:Number(capture.height)||0,
      confidence:Math.max(0,Math.min(1,Number(capture.confidence)||0)),
      longAxisMm:longAxis,
      shortAxisMm:shortAxis,
      depthMm:depth,
      measurements:{
        width_mm:shortAxis,
        height_mm:longAxis,
      },
    };
  }finally{
    await nativeModule.stopSession().catch(()=>{});
  }
}

export function measurementsForIdentifiedPart(
  capture:AutoHardwareCapture,
  scan:{kind?:string;identified_part?:string}
):LidarMeasurement{
  const longAxis=capture.longAxisMm;
  const shortAxis=capture.shortAxisMm;
  const label=(scan.identified_part||'').toLowerCase();
  const kind=(scan.kind||'OTHER').toUpperCase();

  if(!longAxis||!shortAxis)return capture.measurements;

  // Once vision has identified the object, convert the two robust principal-axis
  // extents into the dimensional names that make sense for that part family.
  if(label.includes('spring')){
    return {length_mm:longAxis,diameter_mm:shortAxis,width_mm:shortAxis,height_mm:longAxis};
  }
  if(kind==='FASTENER' || /bolt|screw|stud|pin|rivet/.test(label)){
    return {length_mm:longAxis,diameter_mm:shortAxis,width_mm:shortAxis,height_mm:longAxis};
  }
  if(kind==='BEARING' || /bearing|bushing|spacer|washer/.test(label)){
    return {diameter_mm:longAxis,width_mm:shortAxis,height_mm:shortAxis};
  }
  if(kind==='FITTING' || /fitting|adapter|coupling|elbow|tee|connector/.test(label)){
    return {length_mm:longAxis,width_mm:shortAxis,height_mm:capture.depthMm||shortAxis};
  }
  return {length_mm:longAxis,width_mm:shortAxis,height_mm:capture.depthMm||shortAxis};
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

import React from 'react';
import {ViewProps} from 'react-native';
import {requireNativeViewManager,requireOptionalNativeModule} from 'expo-modules-core';

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
export type LidarAutoScan={
  image_base64:string;
  mime_type:string;
  width:number;
  height:number;
  depth_width:number;
  depth_height:number;
  confidence:number;
  point_count?:number;
  measurements:{
    long_axis_mm:number;
    short_axis_mm:number;
    depth_mm?:number;
    width_mm:number;
    height_mm:number;
  };
};

export type RepairPilotLidarNative={
  isSupported:()=>Promise<boolean>;
  startSession:()=>Promise<{running:boolean}>;
  stopSession:()=>Promise<void>;
  captureDepthSnapshot:()=>Promise<LidarDepthSnapshot>;
  autoCaptureCenteredObject:()=>Promise<LidarAutoScan>;
  measureBetweenPoints:(start:LidarPoint,end:LidarPoint)=>Promise<LidarPointMeasurement>;
};

const nativeModule=requireOptionalNativeModule<RepairPilotLidarNative>('RepairPilotLidar');

let NativePreview:any=null;
try{NativePreview=requireNativeViewManager('RepairPilotLidar')}catch{}

export function RepairPilotLidarPreview(props:ViewProps){
  if(!NativePreview)return null;
  return React.createElement(NativePreview,props);
}

export default nativeModule;

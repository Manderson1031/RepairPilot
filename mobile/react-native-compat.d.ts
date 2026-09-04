import 'react-native';

declare module 'react-native' {
  interface ImageBackgroundProps {
    pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
  }
}

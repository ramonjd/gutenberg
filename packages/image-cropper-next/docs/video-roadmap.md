# Video Editing Roadmap

This document outlines the path from the current image cropper to video editing support.

## Paths

### Path 1: Frame extraction (works today)

The user pauses a video, we extract the current frame as an `ImageBitmap`, and feed it to the existing cropper. The crop/rotate/flip state is applied to that frame. This is screenshot-then-crop — no actual video processing.

```typescript
// Extract frame from video element
const bitmap = await createImageBitmap( videoElement );
const canvas = applyToCanvas(
  bitmap,
  { width: video.videoWidth, height: video.videoHeight },
  cropperState
);
```

This works today with `applyToCanvas()`. No package changes needed.

**Good for:** thumbnail generation, poster images, video cover frames.

### Path 2: Metadata-only crop (medium complexity)

The cropper defines a crop region on the video but doesn't process the video itself. It outputs metadata (`getSourceRegion()`) that a server or client-side library applies during transcoding. The user sees a preview (frame extraction + crop) but the actual video processing happens elsewhere.

This is how YouTube Studio, Google Photos, and most web editors work — the crop UI is just a metadata editor. The heavy lifting is server-side (FFmpeg) or via WebCodecs.

```
User interaction → CropperState → getSourceRegion()
    → { x, y, width, height, rotation }
    ↓
Server: ffmpeg -vf "crop=w:h:x:y,rotate=r"
— or —
Client: WebCodecs + OffscreenCanvas
```

This also works today. The missing piece is the video preview — showing the cropped frame updating as you adjust — which needs a video element + frame extraction loop.

**Good for:** video crop UI for server-side processing, WordPress media upload pipeline.

### Path 3: Client-side WebCodecs processing (ambitious)

Use the WebCodecs API to decode → transform → re-encode the video entirely in the browser. Each frame gets the crop/rotate/flip applied via `applyToCanvas()` or `createExportCamera()`.

```
VideoDecoder → frame → createImageBitmap → applyToCanvas(frame, size, state) → VideoEncoder → output
```

Feasible but complex:
- WebCodecs support is still uneven (Chrome yes, Firefox partial, Safari recent)
- Processing is slow for long videos (even with GPU)
- Audio passthrough needs separate handling
- Memory management for frame buffers

**Good for:** short clips, GIF creation, client-side-only workflows.

### Path 4: Integration with WordPress media processing library

WordPress 7 is building client-side media processing. If that library handles video transcoding (via WebCodecs or WASM FFmpeg), our package provides the crop metadata, they do the processing:

```
CropperState → getSourceRegion() → WP media library → transcoded video
```

This is the most WordPress-native approach and doesn't require us to build video processing.

**Good for:** full WordPress integration, format conversion, quality optimization.

## What we'd need to build

| Phase | What | Effort | Depends on |
|-------|------|--------|-----------|
| Now | Nothing — `applyToCanvas()` already accepts `HTMLVideoElement` | Zero | — |
| Soon | `<VideoCropper>` wrapper: `<video>` playback + frame extraction for live preview | Small | — |
| Soon | FFmpeg flag generator from `getSourceRegion()` | Small | — |
| Later | WebCodecs integration for client-side processing | Large | Browser support |
| Future | WP media library bridge | Medium | WP 7 media library |

## VideoCropper wrapper concept

A thin wrapper that handles video-specific concerns while reusing all existing crop/rotate/flip logic:

```tsx
function VideoCropper( { src, ...cropperProps } ) {
  const videoRef = useRef< HTMLVideoElement >();
  const [ frameSrc, setFrameSrc ] = useState< string >();

  // Extract frame on seek/play for live preview.
  const extractFrame = useCallback( () => {
    const video = videoRef.current;
    if ( ! video ) return;
    const canvas = document.createElement( 'canvas' );
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext( '2d' ).drawImage( video, 0, 0 );
    setFrameSrc( canvas.toDataURL() );
  }, [] );

  return (
    <div>
      <video ref={ videoRef } src={ src } onSeeked={ extractFrame } />
      { frameSrc && <Cropper src={ frameSrc } { ...cropperProps } /> }
    </div>
  );
}
```

## FFmpeg flag generator concept

Convert `getSourceRegion()` output to FFmpeg filter flags:

```typescript
function toFFmpegFlags( region: SourceRegion ): string {
  const filters = [];
  if ( region.rotation !== 0 ) {
    filters.push( `rotate=${ region.rotation * Math.PI / 180 }` );
  }
  if ( region.flip.horizontal ) {
    filters.push( 'hflip' );
  }
  if ( region.flip.vertical ) {
    filters.push( 'vflip' );
  }
  filters.push(
    `crop=${ Math.round( region.width ) }:${ Math.round( region.height ) }:${ Math.round( region.x ) }:${ Math.round( region.y ) }`
  );
  return `-vf "${ filters.join( ',' ) }"`;
}
```

## Key principle

The cropper doesn't need to process video. It defines a crop on video content and outputs metadata. The actual processing is a separate concern — server-side, WebCodecs, or the WP media library. Our `getSourceRegion()` + `applyToCanvas()` are the right bridge.

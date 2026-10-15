import { Capacitor, registerPlugin } from '@capacitor/core';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';
import type { Fix } from './recorder';

/**
 * Phone services with two implementations: the native Android app (Capacitor) and the browser.
 * In the browser, recording stops when the screen locks or the tab is hidden (a web platform
 * limit, not a bug); the Android app keeps recording in the background with a notification.
 */
export const isNativeApp = () => Capacitor.isNativePlatform();

/** Starts GPS updates; resolves to a function that stops them. */
export async function watchLocation(
  onFix: (fix: Fix) => void,
  onError: (message: string) => void,
): Promise<() => void> {
  if (isNativeApp()) {
    const geo = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');
    const id = await geo.addWatcher(
      {
        // A notification is required by Android to keep using GPS with the screen off.
        backgroundTitle: 'OpenFlyover is recording',
        backgroundMessage: 'Recording your activity. Open the app to pause or finish.',
        requestPermissions: true,
        stale: false,
        distanceFilter: 0,
      },
      (location, error) => {
        if (error) {
          onError(
            error.code === 'NOT_AUTHORIZED'
              ? 'Location permission is off. Allow "all the time" in Settings to record.'
              : error.message,
          );
          return;
        }
        if (!location) return;
        onFix({
          lat: location.latitude,
          lon: location.longitude,
          ele: location.altitude,
          time: location.time ?? Date.now(),
          accuracy: location.accuracy,
        });
      },
    );
    return () => void geo.removeWatcher({ id });
  }

  if (!('geolocation' in navigator)) throw new Error('This browser has no GPS access.');
  const id = navigator.geolocation.watchPosition(
    (p) =>
      onFix({
        lat: p.coords.latitude,
        lon: p.coords.longitude,
        ele: p.coords.altitude,
        time: p.timestamp,
        accuracy: p.coords.accuracy,
      }),
    (e) => onError(e.code === e.PERMISSION_DENIED ? 'Location permission was denied.' : e.message),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

/** Takes a photo with the camera at full resolution; null if cancelled. */
export async function takePhoto(): Promise<Blob | null> {
  if (isNativeApp()) {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
    try {
      const photo = await Camera.getPhoto({
        quality: 95,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
        // Also keep it in the phone's gallery, like the normal camera app.
        saveToGallery: true,
        correctOrientation: true,
      });
      return photo.webPath ? await fetch(photo.webPath).then((r) => r.blob()) : null;
    } catch {
      return null; // cancelled
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.capture = 'environment';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** Shares a file (video, GPX) with other apps; falls back to a download. */
export async function shareFile(blob: Blob, fileName: string, title: string): Promise<void> {
  if (isNativeApp()) {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const written = await Filesystem.writeFile({
      path: fileName,
      data: await blobToBase64(blob),
      directory: Directory.Cache,
    });
    await Share.share({ title, files: [written.uri], dialogTitle: title });
    return;
  }
  const file = new File([blob], fileName, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title });
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

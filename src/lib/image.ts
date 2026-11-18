// Photo picking and compression before upload (max 1600px, JPEG ~0.7).
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export async function pickImages(max = 4, square = false): Promise<string[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: !square && max > 1,
    selectionLimit: max,
    allowsEditing: square,
    aspect: square ? [1, 1] : undefined,
    quality: 1,
  });
  if (res.canceled) return [];
  return res.assets.slice(0, max).map((a) => a.uri);
}

export async function compressImage(uri: string, maxSize = 1600): Promise<{ uri: string; width: number; height: number }> {
  const ctx = ImageManipulator.ImageManipulator.manipulate(uri);
  ctx.resize({ width: maxSize });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ compress: 0.7, format: ImageManipulator.SaveFormat.JPEG });
  return { uri: out.uri, width: out.width, height: out.height };
}

export async function uriToArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const res = await fetch(uri);
  return res.arrayBuffer();
}

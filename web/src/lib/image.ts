export interface ImageDimensions {
    width: number;
    height: number;
}

export async function getDimensions(src: string): Promise<ImageDimensions> {
    const res = await fetch(src);
    if (!res.ok) {
        throw new Error(`Failed to fetch image (${res.status}): ${await res.text()}`);
    }
    const { width, height } = await createImageBitmap(await res.blob());
    return { width, height };
}

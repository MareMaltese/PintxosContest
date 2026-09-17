const coverImages = import.meta.glob('../assets/images/cover.{jpg,jpeg,png,webp}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

export const coverImageUrl: string | null = Object.values(coverImages)[0] ?? null;

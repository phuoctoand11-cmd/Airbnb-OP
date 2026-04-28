import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageIcon, Loader2, Star, Trash2, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { LISTINGS_BUCKET, supabase, type Listing, type ListingImage } from "@/lib/supabase";

interface Props {
  listing: Listing;
  canManage: boolean;
}

export function ListingImagesTab({ listing, canManage }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: images, isLoading, error } = useQuery({
    queryKey: ["listing-images", listing.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listing_images")
        .select("*")
        .eq("listing_id", listing.id)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ListingImage[];
    },
  });

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const startPosition = (images?.length ?? 0);
      let i = 0;
      for (const file of Array.from(files)) {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${listing.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from(LISTINGS_BUCKET)
          .upload(path, file, { upsert: false, contentType: file.type });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from(LISTINGS_BUCKET).getPublicUrl(path);
        const { error: insErr } = await supabase.from("listing_images").insert({
          listing_id: listing.id,
          url: pub.publicUrl,
          storage_path: path,
          position: startPosition + i,
        });
        if (insErr) throw insErr;
        i += 1;
      }
      toast({ title: "Images uploaded" });
      queryClient.invalidateQueries({ queryKey: ["listing-images", listing.id] });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: (err as Error).message,
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeMutation = useMutation({
    mutationFn: async (img: ListingImage) => {
      await supabase.storage.from(LISTINGS_BUCKET).remove([img.storage_path]);
      const { error } = await supabase.from("listing_images").delete().eq("id", img.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Image removed" });
      queryClient.invalidateQueries({ queryKey: ["listing-images", listing.id] });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", title: "Could not remove image", description: err.message }),
  });

  const setCoverMutation = useMutation({
    mutationFn: async (img: ListingImage) => {
      const currentCover = images?.find((i) => i.position === 0);
      const oldPosition = img.position;

      const { error: e1 } = await supabase
        .from("listing_images")
        .update({ position: 0 })
        .eq("id", img.id);
      if (e1) throw e1;

      if (currentCover && currentCover.id !== img.id) {
        const { error: e2 } = await supabase
          .from("listing_images")
          .update({ position: oldPosition })
          .eq("id", currentCover.id);
        if (e2) throw e2;
      }

      const { error: e3 } = await supabase
        .from("listings")
        .update({ cover_image_url: img.url })
        .eq("id", listing.id);
      if (e3) throw e3;
    },
    onSuccess: () => {
      toast({ title: "Cover image updated" });
      queryClient.invalidateQueries({ queryKey: ["listing-images", listing.id] });
      queryClient.invalidateQueries({ queryKey: ["listing", listing.id] });
      queryClient.invalidateQueries({ queryKey: ["listings"] });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", title: "Could not set cover", description: err.message }),
  });

  return (
    <Card>
      <CardContent className="p-6">
        {canManage && (
          <div className="mb-6 flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Upload images
            </Button>
            <p className="text-xs text-muted-foreground">
              Files are stored in the <code>listing-images</code> Supabase bucket.
            </p>
          </div>
        )}

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Could not load images</AlertTitle>
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        ) : isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="aspect-square w-full" />
            ))}
          </div>
        ) : !images || images.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-10 text-center">
            <ImageIcon className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="font-medium">No images yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {canManage
                ? "Upload photos to showcase this property to guests."
                : "You don't have permission to upload images."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {images.map((img) => {
              const isCover = img.position === 0;
              const isSettingCover = setCoverMutation.isPending && setCoverMutation.variables?.id === img.id;
              return (
                <div
                  key={img.id}
                  className="group relative aspect-square overflow-hidden rounded-md border bg-muted"
                >
                  <img src={img.url} alt="Listing" className="h-full w-full object-cover" />

                  {/* Cover badge — always visible when this is the cover */}
                  {isCover && (
                    <div className="absolute bottom-2 left-2">
                      <Badge className="gap-1 bg-amber-500 text-white hover:bg-amber-500 shadow-sm">
                        <Star className="h-3 w-3 fill-current" />
                        Cover
                      </Badge>
                    </div>
                  )}

                  {canManage && (
                    <>
                      {/* Delete button — top-right, on hover */}
                      <button
                        type="button"
                        onClick={() => removeMutation.mutate(img)}
                        disabled={removeMutation.isPending || setCoverMutation.isPending}
                        className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md bg-background/90 text-destructive opacity-0 shadow-sm transition-opacity hover:bg-background group-hover:opacity-100 disabled:opacity-50"
                        aria-label="Remove image"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>

                      {/* Set as cover button — bottom-left, on hover, only for non-cover images */}
                      {!isCover && (
                        <button
                          type="button"
                          onClick={() => setCoverMutation.mutate(img)}
                          disabled={setCoverMutation.isPending || removeMutation.isPending}
                          className="absolute bottom-2 left-2 inline-flex h-7 items-center gap-1 rounded-md bg-background/90 px-2 text-xs font-medium opacity-0 shadow-sm transition-opacity hover:bg-background group-hover:opacity-100 disabled:opacity-50"
                          aria-label="Set as cover"
                        >
                          {isSettingCover ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Star className="h-3 w-3" />
                          )}
                          Set as cover
                        </button>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

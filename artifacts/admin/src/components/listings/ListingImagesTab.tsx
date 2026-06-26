import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageIcon, Loader2, Star, Trash2, Upload, X, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  LISTINGS_BUCKET,
  supabase,
  type Listing,
  type ListingImage,
  type ListingRoom,
} from "@/lib/supabase";

interface Props {
  listing: Listing;
  canManage: boolean;
}

export function ListingImagesTab({ listing, canManage }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newRoomName, setNewRoomName] = useState("");
  const [roomToDelete, setRoomToDelete] = useState<ListingRoom | null>(null);
  // undefined = not uploading; string = uploading for that roomId; null = uploading for uncategorized
  const [uploadingRoom, setUploadingRoom] = useState<string | null | undefined>(undefined);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const { data: rooms, isLoading: roomsLoading } = useQuery({
    queryKey: ["listing-rooms", listing.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listing_rooms")
        .select("*")
        .eq("listing_id", listing.id)
        .order("position", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ListingRoom[];
    },
  });

  const { data: images, isLoading: imagesLoading, error: imagesError } = useQuery({
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

  const addRoomMutation = useMutation({
    mutationFn: async (name: string) => {
      const maxPos = (rooms ?? []).reduce((m, r) => Math.max(m, r.position), -1);
      const { error } = await supabase.from("listing_rooms").insert({
        listing_id: listing.id,
        name: name.trim(),
        position: maxPos + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewRoomName("");
      queryClient.invalidateQueries({ queryKey: ["listing-rooms", listing.id] });
      toast({ title: "Đã thêm phòng" });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", title: "Không thể thêm phòng", description: err.message }),
  });

  const deleteRoomMutation = useMutation({
    mutationFn: async (room: ListingRoom) => {
      const { error } = await supabase.from("listing_rooms").delete().eq("id", room.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setRoomToDelete(null);
      queryClient.invalidateQueries({ queryKey: ["listing-rooms", listing.id] });
      queryClient.invalidateQueries({ queryKey: ["listing-images", listing.id] });
      toast({ title: "Đã xóa phòng" });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", title: "Không thể xóa phòng", description: err.message }),
  });

  const handleUpload = async (files: FileList | null, roomId: string | null) => {
    if (!files || files.length === 0) return;
    setUploadingRoom(roomId === null ? null : roomId);
    try {
      const startPosition = (images ?? []).length;
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
          room_id: roomId,
        });
        if (insErr) throw insErr;
        i += 1;
      }
      toast({ title: "Đã tải ảnh lên" });
      queryClient.invalidateQueries({ queryKey: ["listing-images", listing.id] });
    } catch (err) {
      toast({ variant: "destructive", title: "Upload thất bại", description: (err as Error).message });
    } finally {
      setUploadingRoom(undefined);
      const key = roomId ?? "__null__";
      if (fileInputRefs.current[key]) fileInputRefs.current[key]!.value = "";
    }
  };

  const removeMutation = useMutation({
    mutationFn: async (img: ListingImage) => {
      if (img.storage_path) {
        const { error: storageErr } = await supabase.storage
          .from(LISTINGS_BUCKET)
          .remove([img.storage_path]);
        if (storageErr) console.warn("Storage remove failed:", storageErr.message);
      }
      const { error } = await supabase.from("listing_images").delete().eq("id", img.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Đã xóa ảnh" });
      queryClient.invalidateQueries({ queryKey: ["listing-images", listing.id] });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", title: "Không thể xóa ảnh", description: err.message }),
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
      toast({ title: "Đã đặt ảnh bìa" });
      queryClient.invalidateQueries({ queryKey: ["listing-images", listing.id] });
      queryClient.invalidateQueries({ queryKey: ["listing", listing.id] });
      queryClient.invalidateQueries({ queryKey: ["listings"] });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", title: "Không thể đặt ảnh bìa", description: err.message }),
  });

  const assignRoomMutation = useMutation({
    mutationFn: async ({ imgId, roomId }: { imgId: string; roomId: string | null }) => {
      const { error } = await supabase
        .from("listing_images")
        .update({ room_id: roomId })
        .eq("id", imgId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["listing-images", listing.id] });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", title: "Không thể chuyển phòng", description: err.message }),
  });

  const isLoading = roomsLoading || imagesLoading;

  const roomGroups: Array<{ room: ListingRoom | null; groupKey: string; groupLabel: string; imgs: ListingImage[] }> = [
    ...(rooms ?? []).map((room) => ({
      room,
      groupKey: room.id,
      groupLabel: room.name,
      imgs: (images ?? []).filter((i) => i.room_id === room.id),
    })),
    {
      room: null,
      groupKey: "__null__",
      groupLabel: "Chưa phân loại",
      imgs: (images ?? []).filter((i) => i.room_id == null),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Room management */}
      {canManage && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Quản lý phòng</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                placeholder="Tên phòng (vd: Phòng ngủ 1, Phòng khách…)"
                value={newRoomName}
                onChange={(e) => setNewRoomName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newRoomName.trim()) addRoomMutation.mutate(newRoomName);
                }}
                className="max-w-xs"
              />
              <Button
                onClick={() => newRoomName.trim() && addRoomMutation.mutate(newRoomName)}
                disabled={!newRoomName.trim() || addRoomMutation.isPending}
                size="sm"
              >
                {addRoomMutation.isPending ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-1 h-4 w-4" />
                )}
                Thêm phòng
              </Button>
            </div>
            {roomsLoading ? (
              <div className="flex gap-2">
                <Skeleton className="h-7 w-24" />
                <Skeleton className="h-7 w-32" />
              </div>
            ) : rooms && rooms.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {rooms.map((room) => (
                  <div
                    key={room.id}
                    className="flex items-center gap-1 rounded-full border bg-muted px-3 py-1 text-sm"
                  >
                    <span>{room.name}</span>
                    <button
                      type="button"
                      onClick={() => setRoomToDelete(room)}
                      className="ml-1 rounded-full text-muted-foreground hover:text-destructive"
                      aria-label={`Xóa phòng ${room.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Chưa có phòng nào. Thêm phòng để phân loại ảnh.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Images grouped by room */}
      {imagesError ? (
        <Alert variant="destructive">
          <AlertTitle>Không thể tải ảnh</AlertTitle>
          <AlertDescription>{(imagesError as Error).message}</AlertDescription>
        </Alert>
      ) : isLoading ? (
        <Card>
          <CardContent className="p-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="aspect-square w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : (
        roomGroups.map(({ room, groupKey, groupLabel, imgs }) => {
          const isUploadingThisRoom =
            uploadingRoom !== undefined &&
            (room === null ? uploadingRoom === null : uploadingRoom === room.id);

          return (
            <Card key={groupKey}>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-base">{groupLabel}</CardTitle>
                {canManage && (
                  <div>
                    <input
                      ref={(el) => { fileInputRefs.current[groupKey] = el; }}
                      type="file"
                      accept="image/*"
                      multiple
                      hidden
                      onChange={(e) => handleUpload(e.target.files, room?.id ?? null)}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => fileInputRefs.current[groupKey]?.click()}
                      disabled={uploadingRoom !== undefined}
                    >
                      {isUploadingThisRoom ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Upload className="mr-1 h-3.5 w-3.5" />
                      )}
                      Tải ảnh lên
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                {imgs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center text-muted-foreground">
                    <ImageIcon className="mb-2 h-6 w-6" />
                    <p className="text-sm">Chưa có ảnh</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {imgs.map((img) => {
                      const isCover = img.position === 0;
                      const isSettingCover =
                        setCoverMutation.isPending && setCoverMutation.variables?.id === img.id;
                      return (
                        <div
                          key={img.id}
                          className="group relative aspect-square overflow-hidden rounded-md border bg-muted"
                        >
                          <img src={img.url} alt="Listing" className="h-full w-full object-cover" />

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
                              <button
                                type="button"
                                onClick={() => removeMutation.mutate(img)}
                                disabled={removeMutation.isPending || setCoverMutation.isPending}
                                className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md bg-background/90 text-destructive opacity-0 shadow-sm transition-opacity hover:bg-background group-hover:opacity-100 disabled:opacity-50"
                                aria-label="Xóa ảnh"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>

                              {!isCover && (
                                <button
                                  type="button"
                                  onClick={() => setCoverMutation.mutate(img)}
                                  disabled={setCoverMutation.isPending || removeMutation.isPending}
                                  className="absolute bottom-2 left-2 inline-flex h-7 items-center gap-1 rounded-md bg-background/90 px-2 text-xs font-medium opacity-0 shadow-sm transition-opacity hover:bg-background group-hover:opacity-100 disabled:opacity-50"
                                  aria-label="Đặt làm ảnh bìa"
                                >
                                  {isSettingCover ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Star className="h-3 w-3" />
                                  )}
                                  Set as cover
                                </button>
                              )}

                              <div className="absolute bottom-2 right-2 opacity-0 transition-opacity group-hover:opacity-100">
                                <Select
                                  value={img.room_id ?? "__null__"}
                                  onValueChange={(val) =>
                                    assignRoomMutation.mutate({
                                      imgId: img.id,
                                      roomId: val === "__null__" ? null : val,
                                    })
                                  }
                                  disabled={assignRoomMutation.isPending}
                                >
                                  <SelectTrigger className="h-7 w-auto max-w-[110px] border-0 bg-background/90 px-2 text-xs shadow-sm">
                                    <SelectValue placeholder="Phòng" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__null__">Chưa phân loại</SelectItem>
                                    {(rooms ?? []).map((r) => (
                                      <SelectItem key={r.id} value={r.id}>
                                        {r.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
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
        })
      )}

      {/* Delete room confirmation dialog */}
      <AlertDialog open={!!roomToDelete} onOpenChange={(o) => !o && setRoomToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa phòng "{roomToDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Ảnh trong phòng sẽ chuyển về "Chưa phân loại", không bị mất.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => roomToDelete && deleteRoomMutation.mutate(roomToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteRoomMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Xóa phòng
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Listing } from "@/lib/supabase";

const schema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  bedrooms: z.coerce.number().int().min(0),
  bathrooms: z.coerce.number().int().min(0),
  max_guests: z.coerce.number().int().min(1),
  base_price: z.coerce.number().min(0),
  cleaning_fee: z.coerce.number().min(0),
  status: z.enum(["active", "inactive", "maintenance"]),
  cover_image_url: z.string().url().or(z.literal("")).optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  listing: Listing;
  canManage: boolean;
  onSave: (values: Partial<Listing>) => void;
  saving: boolean;
}

export function ListingOverviewTab({ listing, canManage, onSave, saving }: Props) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults(listing),
  });

  useEffect(() => {
    form.reset(defaults(listing));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listing.id]);

  const submit = (v: FormValues) =>
    onSave({
      ...v,
      description: v.description || null,
      address: v.address || null,
      city: v.city || null,
      country: v.country || null,
      cover_image_url: v.cover_image_url || null,
    });

  return (
    <Card>
      <CardContent className="p-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(submit)} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input disabled={!canManage} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea rows={4} disabled={!canManage} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Input disabled={!canManage} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input disabled={!canManage} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country</FormLabel>
                    <FormControl>
                      <Input disabled={!canManage} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <NumberField name="bedrooms" label="Bedrooms" form={form} disabled={!canManage} />
              <NumberField name="bathrooms" label="Bathrooms" form={form} disabled={!canManage} />
              <NumberField name="max_guests" label="Max guests" form={form} disabled={!canManage} />
              <NumberField name="base_price" label="Base price" form={form} disabled={!canManage} step="0.01" />
              <NumberField name="cleaning_fee" label="Cleaning fee" form={form} disabled={!canManage} step="0.01" />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={!canManage}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                        <SelectItem value="maintenance">Maintenance</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cover_image_url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cover image URL</FormLabel>
                    <FormControl>
                      <Input disabled={!canManage} placeholder="https://…" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {canManage && (
              <div className="flex justify-end">
                <Button type="submit" disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save changes
                </Button>
              </div>
            )}
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

function NumberField({
  name,
  label,
  form,
  disabled,
  step,
}: {
  name: keyof FormValues;
  label: string;
  form: ReturnType<typeof useForm<FormValues>>;
  disabled?: boolean;
  step?: string;
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input type="number" step={step} disabled={disabled} {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function defaults(l: Listing): FormValues {
  return {
    title: l.title,
    description: l.description ?? "",
    address: l.address ?? "",
    city: l.city ?? "",
    country: l.country ?? "",
    bedrooms: l.bedrooms,
    bathrooms: l.bathrooms,
    max_guests: l.max_guests,
    base_price: Number(l.base_price),
    cleaning_fee: Number(l.cleaning_fee),
    status: l.status,
    cover_image_url: l.cover_image_url ?? "",
  };
}

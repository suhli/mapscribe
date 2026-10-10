<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";
  import { cn } from "$lib/utils";

  type Variant = "default" | "outline" | "ghost" | "destructive";
  type Size = "default" | "sm" | "icon";

  let {
    variant = "outline",
    size = "default",
    class: className = "",
    children,
    ...rest
  }: HTMLButtonAttributes & { variant?: Variant; size?: Size; class?: string; children?: import("svelte").Snippet } = $props();

  const variants: Record<Variant, string> = {
    default: "bg-primary text-primary-foreground hover:opacity-90",
    outline: "border border-border bg-card hover:bg-accent",
    ghost: "hover:bg-accent",
    destructive: "bg-destructive text-white hover:opacity-90",
  };
  const sizes: Record<Size, string> = {
    default: "h-9 px-3",
    sm: "h-8 px-2 text-xs",
    icon: "h-9 w-9",
  };
</script>

<button
  class={cn(
    "inline-flex items-center justify-center gap-1.5 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40",
    variants[variant],
    sizes[size],
    className,
  )}
  {...rest}
>
  {#if children}{@render children()}{/if}
</button>

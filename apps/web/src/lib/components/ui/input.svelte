<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";
  import { cn } from "$lib/utils";

  let { class: className = "", value = $bindable(""), ...rest }: HTMLInputAttributes & { class?: string; value?: string | number } =
    $props();
</script>

<input
  bind:value
  class={cn(
    "h-9 w-full rounded-md border border-border bg-card px-3 text-sm outline-none ring-ring focus:ring-2",
    className,
  )}
  {...rest}
/>

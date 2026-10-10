<script lang="ts">
  import { Dialog } from "bits-ui";
  import type { Snippet } from "svelte";

  let {
    open = $bindable(false),
    title,
    children,
    footer,
  }: {
    open?: boolean;
    title: string;
    children: Snippet;
    footer?: Snippet;
  } = $props();
</script>

<Dialog.Root bind:open>
  <Dialog.Portal>
    <Dialog.Overlay class="fixed inset-0 z-50 bg-slate-950/45" />
    <Dialog.Content
      class="fixed top-1/2 left-1/2 z-50 max-h-[min(40rem,calc(100%-2rem))] w-[min(34rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-xl border border-border bg-card p-5 text-card-foreground shadow-2xl"
    >
      <div class="mb-4 flex items-start justify-between gap-4">
        <Dialog.Title class="text-base font-semibold">{title}</Dialog.Title>
        <Dialog.Close class="rounded-md px-2 text-muted-foreground hover:bg-accent" aria-label="关闭">×</Dialog.Close>
      </div>
      {@render children()}
      {#if footer}
        <div class="mt-5 flex justify-end gap-2">{@render footer()}</div>
      {/if}
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

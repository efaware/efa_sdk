/**
 * Styled wrappers around Radix DropdownMenu primitives.
 * Use like Radix, get Converge styling for free.
 *
 * Usage:
 *   <DropdownMenu.Root>
 *     <DropdownMenu.Trigger asChild><button>…</button></DropdownMenu.Trigger>
 *     <DropdownMenu.Content>
 *       <DropdownMenu.Item onSelect={() => …}>Bearbeiten</DropdownMenu.Item>
 *       <DropdownMenu.Separator />
 *       <DropdownMenu.Item variant="danger" onSelect={() => …}>Löschen</DropdownMenu.Item>
 *     </DropdownMenu.Content>
 *   </DropdownMenu.Root>
 */
import React from 'react';
import * as Radix from '@radix-ui/react-dropdown-menu';

export const Root = Radix.Root;
export const Trigger = Radix.Trigger;
export const Portal = Radix.Portal;

export const Content = React.forwardRef<
  React.ElementRef<typeof Radix.Content>,
  React.ComponentPropsWithoutRef<typeof Radix.Content>
>(({ className = '', sideOffset = 4, ...props }, ref) => (
  <Radix.Portal>
    <Radix.Content
      ref={ref}
      sideOffset={sideOffset}
      className={`z-50 min-w-[160px] max-w-[calc(100vw-2rem)] rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 ${className}`}
      {...props}
    />
  </Radix.Portal>
));
Content.displayName = 'DropdownMenu.Content';

interface ItemProps extends React.ComponentPropsWithoutRef<typeof Radix.Item> {
  variant?: 'default' | 'danger';
}

export const Item = React.forwardRef<React.ElementRef<typeof Radix.Item>, ItemProps>(
  ({ className = '', variant = 'default', ...props }, ref) => (
    <Radix.Item
      ref={ref}
      className={`flex items-center gap-2 px-3 py-1.5 text-sm rounded-sm cursor-pointer outline-none select-none transition-colors data-[disabled]:opacity-50 data-[disabled]:pointer-events-none ${
        variant === 'danger'
          ? 'text-[var(--color-danger-text)] data-[highlighted]:bg-[var(--color-surface-raised)]'
          : 'text-[var(--color-text-primary)] data-[highlighted]:bg-[var(--color-surface-raised)]'
      } ${className}`}
      {...props}
    />
  ),
);
Item.displayName = 'DropdownMenu.Item';

export const Separator = React.forwardRef<
  React.ElementRef<typeof Radix.Separator>,
  React.ComponentPropsWithoutRef<typeof Radix.Separator>
>(({ className = '', ...props }, ref) => (
  <Radix.Separator
    ref={ref}
    className={`my-1 h-px bg-[var(--color-border)] ${className}`}
    {...props}
  />
));
Separator.displayName = 'DropdownMenu.Separator';

export const Label = React.forwardRef<
  React.ElementRef<typeof Radix.Label>,
  React.ComponentPropsWithoutRef<typeof Radix.Label>
>(({ className = '', ...props }, ref) => (
  <Radix.Label
    ref={ref}
    className={`px-3 py-1 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wide ${className}`}
    {...props}
  />
));
Label.displayName = 'DropdownMenu.Label';

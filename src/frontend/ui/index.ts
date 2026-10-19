/**
 * @efa-one/sdk/frontend/ui — das Converge Design-System-Kit.
 *
 * Barrel-Export:
 *   import { Button, DataTable, RecordDialog, type ColumnDef } from '@efa-one/sdk/frontend/ui';
 *
 * Einmal pro App die Begleit-Styles importieren (für `Badge`/`Skeleton`):
 *   import '@efa-one/sdk/frontend/ui/styles.css';
 *
 * Voraussetzung im Consumer: die Converge-Design-Tokens (`--color-*`,
 * `--border-radius-*`) im DOM + Tailwind (Radius-Mapping auf die Vars) — beides
 * liefert das App-Scaffold (`converge-tokens.css` + `tailwind.config.js`).
 */
export { Button } from './Button.js';
export { Input } from './Input.js';
export { Badge } from './Badge.js';
export { Alert, type AlertVariant } from './Alert.js';
export { Dialog, DialogClose } from './Dialog.js';
export * as DropdownMenu from './DropdownMenu.js';
export { Tooltip, TooltipProvider } from './Tooltip.js';
export { EmptyState } from './EmptyState.js';
export { Skeleton, SkeletonRow } from './Skeleton.js';
export { RecordDialog, type RecordDialogMode } from './RecordDialog.js';
export { useIsMobile, MOBILE_QUERY } from '../useIsMobile.js';
export {
  DataTable,
  DEFAULT_VIEW_VERSION,
  type ColumnDef,
  type FilterDef,
  type DataTableSelectionProps,
} from './DataTable.js';
export { toCsv, toXlsx, downloadFile, type ExportCell, type ExportTable } from './tableExport.js';

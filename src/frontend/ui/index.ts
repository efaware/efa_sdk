/**
 * @efa-one/sdk/frontend/ui — das Converge Design-System-Kit.
 *
 * Barrel-Export:
 *   import { Button, DataTable, RecordDialog, type ColumnDef } from '@efa-one/sdk/frontend/ui';
 *
 * Einmal pro App die Begleit-Styles importieren (Badge, Skeleton, Alert, Switch,
 * Checkbox, RadioGroup, Progress, Toast):
 *   import '@efa-one/sdk/frontend/ui/styles.css';
 *
 * Voraussetzung im Consumer: die Converge-Design-Tokens (`--color-*`,
 * `--border-radius-*`) im DOM + Tailwind (Radius-Mapping auf die Vars) — beides
 * liefert das App-Scaffold (`converge-tokens.css` + `tailwind.config.js`).
 */
export { Button } from './Button.js';
export { Input, type InputProps } from './Input.js';
export { Textarea, type TextareaProps } from './Textarea.js';
export { Select, type SelectProps, type SelectOption } from './Select.js';
export { FormField, FormSection, type FormFieldProps, type FormSectionProps } from './FormField.js';
export { fieldClassName, useFormField, type FormFieldContextValue } from './field.js';
export { Checkbox, CheckboxGroup, type CheckboxProps, type CheckboxGroupProps, type ChoiceOption } from './Checkbox.js';
export { RadioGroup, type RadioGroupProps } from './RadioGroup.js';
export { SegmentedControl, type SegmentedControlProps, type SegmentedOption } from './SegmentedControl.js';
export { SearchInput, type SearchInputProps } from './SearchInput.js';
export { Combobox, filterOptions, type ComboboxProps, type ComboboxOption } from './Combobox.js';
export {
  FileDropzone,
  validateFiles,
  formatFileSize,
  type FileDropzoneProps,
  type FileRejection,
  type FileRejectionReason,
  type FileRules,
} from './FileDropzone.js';
export { Switch, SwitchControl, type SwitchProps, type SwitchControlProps, type SwitchTone } from './Switch.js';
export { Badge } from './Badge.js';
export { Alert, type AlertVariant } from './Alert.js';
export { Dialog, DialogClose, DEFAULT_DIALOG_SIZE, type DialogSize, type DialogInitialFocus } from './Dialog.js';
export { Tabs, TabPanel, tabId, tabPanelId, tabIdPrefix, nextTabKey, type TabItem, type TabsProps, type TabPanelProps } from './Tabs.js';
export { SidePanel, type SidePanelProps, type SidePanelWidth } from './SidePanel.js';
export { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog.js';
export { DateTimeField, type DateTimeFieldProps } from './DateTimeField.js';
export { parseDateTimeDe, maskDateTimeInput, type DateTimeParseResult } from './dateTimeInput.js';
export * as DropdownMenu from './DropdownMenu.js';
export { Tooltip, TooltipProvider } from './Tooltip.js';
export { Popover, type PopoverProps } from './Popover.js';
export { ToastProvider, useToast, type ToastApi, type ToastOptions, type ToastVariant } from './Toast.js';
export { Spinner, type SpinnerProps, type SpinnerSize } from './Spinner.js';
export { Progress, type ProgressProps, type ProgressTone } from './Progress.js';
export { Card, type CardProps } from './Card.js';
export { Avatar, type AvatarProps, type AvatarSize } from './Avatar.js';
export { CopyButton, copyText, type CopyButtonProps } from './CopyButton.js';
export { Collapsible, type CollapsibleProps } from './Collapsible.js';
export { Breadcrumb, type BreadcrumbProps, type BreadcrumbItem } from './Breadcrumb.js';
export { Pagination, type PaginationProps } from './Pagination.js';
export { Separator, Kbd, type SeparatorProps } from './Separator.js';
export { EmptyState } from './EmptyState.js';
export { Skeleton, SkeletonRow } from './Skeleton.js';
export { RecordDialog, type RecordDialogMode, type RecordDialogProps } from './RecordDialog.js';
export { ConfirmDeleteDialog, type ConfirmDeleteDialogProps } from './ConfirmDeleteDialog.js';
export { useRecords, type UseRecordsResult } from './useRecords.js';
export {
  createRecordsController,
  type RecordsController,
  type RecordsOptions,
  type RecordsState,
  type RecordsSaveMode,
  type RecordsDialogMode,
} from './records.js';
export { useIsMobile, MOBILE_QUERY } from '../useIsMobile.js';
export {
  DataTable,
  DEFAULT_VIEW_VERSION,
  type ColumnDef,
  type FilterDef,
  type DataTableSelectionProps,
} from './DataTable.js';
export { toCsv, toXlsx, downloadFile, type ExportCell, type ExportTable } from './tableExport.js';

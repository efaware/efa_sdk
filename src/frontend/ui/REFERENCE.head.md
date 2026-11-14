# @efa-one/sdk/frontend/ui — API reference (v{{VERSION}})

Generated from the package's type declarations. Read this file instead of the sources in `node_modules`: it lists every export with its props. Comments are in German.

```ts
import { useRecords, DataTable, RecordDialog, ConfirmDeleteDialog, Button, Input, type ColumnDef } from '@efa-one/sdk/frontend/ui';
import '@efa-one/sdk/frontend/ui/styles.css'; // once per app (Badge, Skeleton)
```

Business objects (own number, tabs or sub-lists) open on their own **detail page with a speaking URL** such as `/bp/0000010100/` (create: `/bp/neu/`), not in a dialog: the app uses `HashRouter` + `notifyRouteChange`, `DataTable.onRowClick` navigates, and `useRecords` only loads the list (see the template `CLAUDE.md` → „Sprechende URLs und Detailseiten"). Small entries without an address of their own (settings, catalogues, sub-items on a detail page) use `useRecords` with `RecordDialog`: spread `records.dialogProps` into `RecordDialog` and `records.deleteDialogProps` into `ConfirmDeleteDialog`; pass `records.openRecord` to `DataTable.onRowClick`. Never wire the dialog yourself.

Detail pages set `data-efa-page="record"` and `data-efa-mode` on their container and `data-efa-action` on their footer buttons themselves.

Forms: wrap every field in `FormField` (label, `hint`, `error`, `required`); the fields inside wire ids and ARIA themselves. Pick the control by the data: free text `Input`/`Textarea`, API keys and passwords `SecretInput` (stored secret shows a fixed row of dots, never a hint like „leer = unverändert“), few fixed values `Select` (2–5 visible: `SegmentedControl` or `RadioGroup`), long lists with search `Combobox`, on/off `Switch`, several of a list or consent `Checkbox`/`CheckboxGroup`, files `FileDropzone`. Never style a native `<select>`, `<textarea>` or checkbox yourself. Short confirmations after an action: `useToast()` (needs `<ToastProvider>` once around the app); errors the user must fix: `Alert` in the form.

Never `window.confirm`/`alert`: use `ConfirmDialog` (or `ConfirmDeleteDialog`). Objects with sub-lists get a detail page with `Tabs`/`TabPanel` and `SidePanel` instead of nested dialogs. Date + time input: `DateTimeField`.

Test markers (set by the components, do not add them yourself): `data-efa-list` (DataTable, value = `listId`), `data-efa-row` (row key), `data-efa-dialog="record" | "confirm-delete" | "confirm"`, `data-efa-tab`, `data-efa-sidepanel`, `data-efa-field="datetime" | "secret"`, `data-efa-secret="set" | "empty"`, `data-efa-mode`, `data-efa-action="save" | "edit" | "cancel" | "close" | "confirm-delete" | "confirm"`.

Read only the section you need, e.g. `sed -n '/^## DataTable$/,/^## /p' <this file>`. Each section heading is the module name from the contents list.

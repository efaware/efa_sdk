# @efa-one/sdk/frontend/ui — API reference (v{{VERSION}})

Generated from the package's type declarations. Read this file instead of the sources in `node_modules`: it lists every export with its props. Comments are in German.

```ts
import { useRecords, DataTable, RecordDialog, ConfirmDeleteDialog, Button, Input, type ColumnDef } from '@efa-one/sdk/frontend/ui';
import '@efa-one/sdk/frontend/ui/styles.css'; // once per app (Badge, Skeleton)
```

Lists with create/edit/delete always use `useRecords`: spread `records.dialogProps` into `RecordDialog` and `records.deleteDialogProps` into `ConfirmDeleteDialog`; pass `records.openRecord` to `DataTable.onRowClick`. Never wire the dialog yourself.

Never `window.confirm`/`alert`: use `ConfirmDialog` (or `ConfirmDeleteDialog`). Objects with sub-lists get a detail page with `Tabs`/`TabPanel` and `SidePanel` instead of nested dialogs. Date + time input: `DateTimeField`.

Test markers (set by the components, do not add them yourself): `data-efa-list` (DataTable, value = `listId`), `data-efa-row` (row key), `data-efa-dialog="record" | "confirm-delete" | "confirm"`, `data-efa-tab`, `data-efa-sidepanel`, `data-efa-field="datetime"`, `data-efa-mode`, `data-efa-action="save" | "edit" | "cancel" | "close" | "confirm-delete" | "confirm"`.

Read only the section you need, e.g. `sed -n '/^## DataTable$/,/^## /p' <this file>`. Each section heading is the module name from the contents list.

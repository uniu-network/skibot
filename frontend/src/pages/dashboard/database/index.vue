<template>
  <n-layout style="height: 100vh">
    <n-layout-content
      style="margin-top: 30px; margin-left: 30px; margin-right: 30px"
    >
      <n-space vertical size="large">
        <n-flex justify="space-between" align="center">
          <div>
            <h2 style="margin: 0 0 6px">数据库</h2>
          </div>
          <n-space>
            <n-tag :bordered="false" type="info">引擎: {{ dbEngine }}</n-tag>
            <n-button type="primary" secondary size="small" @click="loadTables"
              >刷新</n-button
            >
            <n-button size="small" @click="showCreateTableModal = true"
              >新建表</n-button
            >
          </n-space>
        </n-flex>

        <n-tabs v-model:value="activeTab" type="line" animated>
          <n-tab-pane name="tables" tab="数据表">
            <n-spin :show="tablesLoading">
              <n-grid :cols="24" :x-gap="12">
                <n-gi :span="6">
                  <n-card
                    size="small"
                    title="表列表"
                    style="max-height: calc(100vh - 260px); overflow-y: auto"
                  >
                    <n-menu
                      :options="tableMenuOptions"
                      :value="selectedTable"
                      @update:value="onTableSelect"
                    />
                    <n-empty
                      v-if="tables.length === 0 && !tablesLoading"
                      description="暂无数据表"
                      style="margin-top: 20px"
                    />
                  </n-card>
                </n-gi>
                <n-gi :span="18">
                  <n-card
                    v-if="selectedTable"
                    size="small"
                    :title="'表: ' + selectedTable"
                    style="max-height: calc(100vh - 260px); overflow-y: auto"
                  >
                    <template #header-extra>
                      <n-space>
                        <n-tag :bordered="false">{{ tableRowCount }} 行</n-tag>
                        <n-button
                          size="tiny"
                          type="error"
                          secondary
                          @click="dropTable"
                          >删除表</n-button
                        >
                      </n-space>
                    </template>

                    <n-tabs
                      v-model:value="tableSubTab"
                      type="segment"
                      size="small"
                    >
                      <n-tab-pane name="data" tab="数据">
                        <n-flex
                          justify="space-between"
                          align="center"
                          style="margin-bottom: 8px"
                        >
                          <n-text depth="3"
                            >{{ tableData.length }} 条 (共
                            {{ tableRowCount }} 条)</n-text
                          >
                          <n-space>
                            <n-button size="small" @click="loadTableData"
                              >刷新</n-button
                            >
                            <n-button
                              size="small"
                              type="primary"
                              @click="showInsertRowModal = true"
                              >插入行</n-button
                            >
                          </n-space>
                        </n-flex>
                        <n-spin :show="tableDataLoading">
                          <div style="overflow-x: auto">
                            <n-data-table
                              :columns="dataColumns"
                              :data="tableData"
                              :bordered="true"
                              :single-line="false"
                              size="small"
                              :max-height="400"
                              :row-key="rowKeyFn"
                            />
                          </div>
                        </n-spin>
                        <n-flex justify="center" style="margin-top: 12px">
                          <n-pagination
                            v-model:page="currentPage"
                            :page-count="totalPages"
                            :page-size="pageSize"
                            show-size-picker
                            :page-sizes="[20, 50, 100, 200]"
                            @update:page="onPageChange"
                            @update:page-size="onPageSizeChange"
                          />
                        </n-flex>
                      </n-tab-pane>
                      <n-tab-pane name="structure" tab="结构">
                        <n-spin :show="tableDataLoading">
                          <n-data-table
                            :columns="structureColumns"
                            :data="tableColumns"
                            :bordered="true"
                            :single-line="false"
                            size="small"
                          />
                        </n-spin>
                      </n-tab-pane>
                    </n-tabs>
                  </n-card>
                  <n-card v-else size="small">
                    <n-empty
                      description="请从左侧选择一个数据表"
                      style="margin-top: 80px"
                    />
                  </n-card>
                </n-gi>
              </n-grid>
            </n-spin>
          </n-tab-pane>

          <n-tab-pane name="query" tab="SQL 查询">
            <n-space vertical size="small">
              <n-input
                v-model:value="sqlQuery"
                type="textarea"
                placeholder="输入 SQL 查询语句..."
                :rows="6"
                :autosize="{ minRows: 3, maxRows: 16 }"
                font="monospace"
              />
              <n-flex justify="space-between" align="center">
                <n-space>
                  <n-button
                    type="primary"
                    :loading="queryLoading"
                    @click="executeQuery"
                    >执行</n-button
                  >
                  <n-button @click="sqlQuery = ''">清空</n-button>
                </n-space>
                <n-flex size="small">
                  <n-tag
                    v-for="qt in quickQueries"
                    :key="qt.label"
                    style="cursor: pointer"
                    @click="sqlQuery = qt.sql"
                  >
                    {{ qt.label }}
                  </n-tag>
                </n-flex>
              </n-flex>

              <n-card
                v-if="queryResult !== null"
                size="small"
                :title="queryResultTitle"
                style="margin-top: 8px"
              >
                <template #header-extra>
                  <n-tag
                    :bordered="false"
                    :type="queryError ? 'error' : 'success'"
                  >
                    {{ queryError ? "失败" : "成功" }}
                  </n-tag>
                </template>
                <n-alert v-if="queryError" type="error" :bordered="false">{{
                  queryResult
                }}</n-alert>
                <n-descriptions
                  v-else-if="queryResultType === 'execute'"
                  bordered
                  :column="1"
                  label-placement="left"
                  size="small"
                >
                  <n-descriptions-item label="影响行数">{{
                    queryResult.changes
                  }}</n-descriptions-item>
                  <n-descriptions-item
                    v-if="queryResult.lastInsertRowid"
                    label="最后插入ID"
                    >{{ queryResult.lastInsertRowid }}</n-descriptions-item
                  >
                </n-descriptions>
                <div
                  v-else
                  style="overflow-x: auto; max-height: 400px; overflow-y: auto"
                >
                  <n-data-table
                    v-if="Array.isArray(queryResult) && queryResult.length > 0"
                    :columns="queryResultColumns"
                    :data="queryResult"
                    :bordered="true"
                    :single-line="false"
                    size="small"
                    :max-height="380"
                  />
                  <n-empty
                    v-else-if="Array.isArray(queryResult)"
                    description="查询结果为空"
                  />
                </div>
              </n-card>
            </n-space>
          </n-tab-pane>
        </n-tabs>
      </n-space>
    </n-layout-content>
  </n-layout>

  <n-modal
    v-model:show="showCreateTableModal"
    preset="dialog"
    title="新建数据表"
    positive-text="创建"
    negative-text="取消"
    @positive-click="createTable"
  >
    <n-form>
      <n-form-item label="表名">
        <n-input v-model:value="newTableName" placeholder="请输入表名" />
      </n-form-item>
      <n-form-item label="列定义">
        <n-dynamic-input
          v-model:value="newTableColumns"
          :on-create="createColumnEntry"
        >
          <template #default="{ value }">
            <n-flex style="width: 100%" align="center">
              <n-input
                v-model:value="value.name"
                placeholder="列名"
                style="width: 30%"
              />
              <n-select
                v-model:value="value.type"
                :options="columnTypeOptions"
                style="width: 25%"
              />
              <n-checkbox v-model:checked="value.notNull" size="small"
                >NOT NULL</n-checkbox
              >
              <n-checkbox v-model:checked="value.primaryKey" size="small"
                >PK</n-checkbox
              >
              <n-checkbox v-model:checked="value.unique" size="small"
                >UNIQUE</n-checkbox
              >
              <n-input
                v-model:value="value.defaultValue"
                placeholder="默认值"
                style="width: 20%"
              />
            </n-flex>
          </template>
        </n-dynamic-input>
      </n-form-item>
    </n-form>
  </n-modal>

  <n-modal
    v-model:show="showInsertRowModal"
    preset="dialog"
    title="插入行"
    positive-text="插入"
    negative-text="取消"
    @positive-click="insertRow"
    style="width: 600px"
  >
    <n-form>
      <n-form-item
        v-for="col in tableColumns.filter((c) => !c.autoIncrement)"
        :key="col.name"
        :label="col.name"
      >
        <n-input
          v-model:value="insertRowData[col.name]"
          :placeholder="col.type + (col.notNull ? ' (必填)' : '')"
        />
      </n-form-item>
    </n-form>
  </n-modal>

  <n-modal
    v-model:show="showEditRowModal"
    preset="dialog"
    title="编辑行"
    positive-text="保存"
    negative-text="取消"
    @positive-click="saveEditRow"
    style="width: 600px"
  >
    <n-form>
      <n-form-item
        v-for="col in tableColumns"
        :key="col.name"
        :label="col.name"
      >
        <n-input
          v-model:value="editRowData.data[col.name]"
          :disabled="col.primaryKey"
          :placeholder="col.type"
        />
      </n-form-item>
    </n-form>
  </n-modal>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, reactive, h } from "vue";
import { useMessage, useDialog, NButton, NPopconfirm } from "naive-ui";

const message = useMessage();
const dialog = useDialog();

const activeTab = ref("tables");
const tableSubTab = ref("data");

const dbEngine = ref("unknown");
const tables = ref<{ name: string; rowCount: number }[]>([]);
const tablesLoading = ref(true);

const selectedTable = ref<string | null>(null);
const tableColumns = ref<any[]>([]);
const tableData = ref<any[]>([]);
const tableRowCount = ref(0);
const tableDataLoading = ref(false);

const currentPage = ref(1);
const pageSize = ref(50);
const totalPages = computed(() =>
  Math.max(1, Math.ceil(tableRowCount.value / pageSize.value)),
);

const sqlQuery = ref("");
const queryLoading = ref(false);
const queryResult = ref<any>(null);
const queryResultType = ref<"query" | "execute">("query");
const queryResultTitle = ref("");
const queryError = ref(false);

const showCreateTableModal = ref(false);
const newTableName = ref("");
const newTableColumns = ref<any[]>([]);

const showInsertRowModal = ref(false);
const insertRowData = reactive<Record<string, string>>({});

const showEditRowModal = ref(false);
const editRowData = reactive<{
  where: Record<string, any>;
  data: Record<string, string>;
}>({ where: {}, data: {} });

const sortKey = ref<string | null>(null);
const sortOrder = ref<"asc" | "desc">("asc");

const columnTypeOptions = [
  { label: "TEXT", value: "TEXT" },
  { label: "INTEGER", value: "INTEGER" },
  { label: "REAL", value: "REAL" },
  { label: "BLOB", value: "BLOB" },
  { label: "BOOLEAN", value: "BOOLEAN" },
  { label: "SERIAL", value: "SERIAL" },
];

const quickQueries = computed(() => {
  const queries = [
    {
      label: "查看所有表",
      sql: "SELECT name FROM sqlite_master WHERE type='table'",
    },
    {
      label: "查看表结构",
      sql: selectedTable.value
        ? `PRAGMA table_info("${selectedTable.value}")`
        : "",
    },
    {
      label: "最近10条",
      sql: selectedTable.value
        ? `SELECT * FROM "${selectedTable.value}" ORDER BY rowid DESC LIMIT 10`
        : "",
    },
    {
      label: "表行数",
      sql: selectedTable.value
        ? `SELECT COUNT(*) AS cnt FROM "${selectedTable.value}"`
        : "",
    },
  ];
  return queries.filter((q) => q.sql);
});

const tableMenuOptions = computed(() => {
  return tables.value.map((t) => ({
    label: `${t.name} (${t.rowCount})`,
    key: t.name,
  }));
});

function createColumnEntry() {
  return {
    name: "",
    type: "TEXT",
    notNull: false,
    primaryKey: false,
    unique: false,
    defaultValue: "",
  };
}

const dataColumns = computed(() => {
  if (tableColumns.value.length === 0) return [];
  const cols = tableColumns.value.map((col) => ({
    title: col.name,
    key: col.name,
    width: 150,
    ellipsis: { tooltip: true },
    sorter:
      col.type === "INTEGER" ||
      col.type === "REAL" ||
      col.type === "integer" ||
      col.type === "real"
        ? (a: any, b: any) => (a[col.name] ?? 0) - (b[col.name] ?? 0)
        : undefined,
    render(row: any) {
      const val = row[col.name];
      if (val === null || val === undefined)
        return h("span", { style: "color: #999;" }, "NULL");
      if (typeof val === "object") return JSON.stringify(val);
      return String(val);
    },
  }));
  return [
    ...cols,
    {
      title: "操作",
      key: "_actions",
      width: 120,
      fixed: "right",
      render(row: any) {
        return h(
          NPopconfirm,
          { onPositiveClick: () => deleteRow(row) },
          {
            trigger: () =>
              h(
                NButton,
                { size: "tiny", tertiary: true, type: "error" },
                () => "删除",
              ),
            default: () => "确认删除此行?",
          },
        );
      },
    },
  ];
});

const structureColumns = [
  { title: "列名", key: "name", width: 150 },
  { title: "类型", key: "type", width: 120 },
  {
    title: "非空",
    key: "notNull",
    width: 80,
    render(row: any) {
      return row.notNull ? "是" : "否";
    },
  },
  {
    title: "主键",
    key: "primaryKey",
    width: 80,
    render(row: any) {
      return row.primaryKey ? "是" : "否";
    },
  },
  {
    title: "默认值",
    key: "defaultValue",
    width: 150,
    render(row: any) {
      return row.defaultValue !== null && row.defaultValue !== undefined
        ? String(row.defaultValue)
        : "-";
    },
  },
];

const queryResultColumns = computed(() => {
  if (!Array.isArray(queryResult.value) || queryResult.value.length === 0)
    return [];
  const keys = Object.keys(queryResult.value[0]);
  return keys.map((k) => ({
    title: k,
    key: k,
    width: 150,
    ellipsis: { tooltip: true },
    render(row: any) {
      const val = row[k];
      if (val === null || val === undefined) return "NULL";
      if (typeof val === "object") return JSON.stringify(val);
      return String(val);
    },
  }));
});

function rowKeyFn(row: any) {
  const pkCols = tableColumns.value.filter((c) => c.primaryKey);
  if (pkCols.length > 0) {
    return pkCols.map((c) => String(row[c.name])).join("|");
  }
  return Object.values(row).join("|");
}

async function loadTables() {
  tablesLoading.value = true;
  try {
    const resp = await fetch("/api/db/tables", { credentials: "include" });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.message || "Failed to load tables");
    }
    const data = await resp.json();
    dbEngine.value = data.engine || "unknown";
    tables.value = data.tables || [];
  } catch (e: any) {
    message.error(`获取表列表失败: ${e.message || "未知错误"}`);
  } finally {
    tablesLoading.value = false;
  }
}

async function onTableSelect(key: string) {
  selectedTable.value = key;
  currentPage.value = 1;
  await loadTableStructure();
  await loadTableData();
}

async function loadTableStructure() {
  if (!selectedTable.value) return;
  tableDataLoading.value = true;
  try {
    const resp = await fetch(
      `/api/db/table?name=${encodeURIComponent(selectedTable.value)}`,
      { credentials: "include" },
    );
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.message || "Failed");
    }
    const data = await resp.json();
    tableColumns.value = data.columns || [];
    tableRowCount.value = data.rowCount || 0;
  } catch (e: any) {
    message.error(`获取表结构失败: ${e.message}`);
  } finally {
    tableDataLoading.value = false;
  }
}

async function loadTableData() {
  if (!selectedTable.value) return;
  tableDataLoading.value = true;
  try {
    const offset = (currentPage.value - 1) * pageSize.value;
    const params = new URLSearchParams({
      limit: String(pageSize.value),
      offset: String(offset),
    });
    if (sortKey.value) {
      params.set("sortBy", sortKey.value);
      params.set("sortOrder", sortOrder.value);
    }
    const resp = await fetch(
      `/api/db/table/data?name=${encodeURIComponent(selectedTable.value)}&${params}`,
      { credentials: "include" },
    );
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.message || "Failed");
    }
    const data = await resp.json();
    tableData.value = data.rows || [];
    tableRowCount.value = data.total || 0;
  } catch (e: any) {
    message.error(`获取数据失败: ${e.message}`);
  } finally {
    tableDataLoading.value = false;
  }
}

function onPageChange(page: number) {
  currentPage.value = page;
  loadTableData();
}

function onPageSizeChange(size: number) {
  pageSize.value = size;
  currentPage.value = 1;
  loadTableData();
}

async function executeQuery() {
  if (!sqlQuery.value.trim()) {
    message.warning("请输入 SQL 语句");
    return;
  }
  queryLoading.value = true;
  queryError.value = false;
  queryResult.value = null;
  try {
    const resp = await fetch("/api/db/query", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ sql: sqlQuery.value }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      queryError.value = true;
      queryResult.value = data.message || "Unknown error";
      queryResultTitle.value = "查询错误";
      queryResultType.value = "execute";
    } else {
      queryResultType.value = data.type;
      queryResult.value = data.type === "query" ? data.rows : data;
      queryResultTitle.value =
        data.type === "query"
          ? `查询结果 (${data.rowCount || (data.rows || []).length} 行)`
          : "执行成功";
    }
  } catch (e: any) {
    queryError.value = true;
    queryResult.value = e.message || "Unknown error";
    queryResultTitle.value = "查询错误";
  } finally {
    queryLoading.value = false;
  }
}

async function createTable() {
  if (!newTableName.value.trim()) {
    message.error("请输入表名");
    return false;
  }
  const validCols = newTableColumns.value.filter((c) => c.name.trim());
  if (validCols.length === 0) {
    message.error("至少需要一列");
    return false;
  }
  try {
    const resp = await fetch("/api/db/table/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        name: newTableName.value.trim(),
        columns: validCols.map((c) => ({
          ...c,
          defaultValue: c.defaultValue === "" ? undefined : c.defaultValue,
        })),
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      message.error(data.message || "创建失败");
      return false;
    }
    message.success(`表 "${newTableName.value.trim()}" 创建成功`);
    showCreateTableModal.value = false;
    newTableName.value = "";
    newTableColumns.value = [];
    await loadTables();
    return true;
  } catch (e: any) {
    message.error(`创建失败: ${e.message}`);
    return false;
  }
}

async function dropTable() {
  if (!selectedTable.value) return;
  dialog.warning({
    title: "确认删除表",
    content: `确定要删除表 "${selectedTable.value}" 吗？此操作不可撤销！`,
    positiveText: "确认删除",
    negativeText: "取消",
    onPositiveClick: async () => {
      try {
        const resp = await fetch("/api/db/table/drop", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name: selectedTable.value }),
        });
        const data = await resp.json();
        if (!resp.ok) {
          message.error(data.message || "删除失败");
          return;
        }
        message.success(`表 "${selectedTable.value}" 已删除`);
        selectedTable.value = null;
        tableColumns.value = [];
        tableData.value = [];
        tableRowCount.value = 0;
        await loadTables();
      } catch (e: any) {
        message.error(`删除失败: ${e.message}`);
      }
    },
  });
}

function openEditRow(row: any) {
  editRowData.where = {};
  editRowData.data = {};
  const pkCols = tableColumns.value.filter((c) => c.primaryKey);
  if (pkCols.length > 0) {
    for (const pk of pkCols) {
      editRowData.where[pk.name] = row[pk.name];
    }
  } else {
    for (const col of tableColumns.value) {
      editRowData.where[col.name] = row[col.name];
    }
  }
  for (const col of tableColumns.value) {
    editRowData.data[col.name] =
      row[col.name] !== null && row[col.name] !== undefined
        ? String(row[col.name])
        : "";
  }
  showEditRowModal.value = true;
}

async function saveEditRow() {
  if (!selectedTable.value) return;
  const dataToSend: Record<string, any> = {};
  const pkNames = tableColumns.value
    .filter((c) => c.primaryKey)
    .map((c) => c.name);
  for (const col of tableColumns.value) {
    if (pkNames.includes(col.name)) continue;
    let val: any = editRowData.data[col.name];
    if (val === "") val = null;
    else if (col.type === "INTEGER" || col.type === "integer")
      val = Number(val);
    else if (col.type === "REAL" || col.type === "real") val = Number(val);
    dataToSend[col.name] = val;
  }
  try {
    const resp = await fetch("/api/db/table/row", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        table: selectedTable.value,
        data: dataToSend,
        where: editRowData.where,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      message.error(data.message || "更新失败");
      return;
    }
    message.success(`更新成功，影响 ${data.changes} 行`);
    showEditRowModal.value = false;
    await loadTableData();
  } catch (e: any) {
    message.error(`更新失败: ${e.message}`);
  }
}

async function insertRow() {
  if (!selectedTable.value) return;
  const dataToSend: Record<string, any> = {};
  for (const col of tableColumns.value) {
    if (col.autoIncrement) continue;
    let val: any = insertRowData[col.name];
    if (val === undefined || val === "") continue;
    if (val === "") val = null;
    else if (col.type === "INTEGER" || col.type === "integer")
      val = Number(val);
    else if (col.type === "REAL" || col.type === "real") val = Number(val);
    dataToSend[col.name] = val;
  }
  try {
    const resp = await fetch("/api/db/table/row", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ table: selectedTable.value, data: dataToSend }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      message.error(data.message || "插入失败");
      return false;
    }
    message.success("插入成功");
    showInsertRowModal.value = false;
    Object.keys(insertRowData).forEach((k) => delete insertRowData[k]);
    await loadTableData();
    return true;
  } catch (e: any) {
    message.error(`插入失败: ${e.message}`);
    return false;
  }
}

async function deleteRow(row: any) {
  if (!selectedTable.value) return;
  const where: Record<string, any> = {};
  const pkCols = tableColumns.value.filter((c) => c.primaryKey);
  if (pkCols.length > 0) {
    for (const pk of pkCols) {
      where[pk.name] = row[pk.name];
    }
  } else {
    where["_rowid_"] = row._rowid_ || row.id || Object.values(row)[0];
  }
  try {
    const resp = await fetch("/api/db/table/row/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ table: selectedTable.value, where }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      message.error(data.message || "删除失败");
      return;
    }
    message.success("删除成功");
    await loadTableData();
  } catch (e: any) {
    message.error(`删除失败: ${e.message}`);
  }
}

onMounted(() => {
  loadTables();
});
</script>

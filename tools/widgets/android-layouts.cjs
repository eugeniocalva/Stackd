// Generates the stackd-widgets RemoteViews layouts (1.2.2 HG-15 WG-4).
// 2026-11-10 (owner, phone check): bigger text; the list layout has 8 row
// slots so a taller Account balances / Upcoming lists more.
// Run: node tools/widgets/android-layouts.cjs plugins/stackd-widgets/android/src/main/res/layout
const fs = require('fs');
const path = require('path');
const out = process.argv[2];
const HEAD = '<?xml version="1.0" encoding="utf-8"?>\n<!-- 1.2.2 (HG-15 WG-4): see docs/phone-widgets-plan.md §12 -->\n';
const NS = 'xmlns:android="http://schemas.android.com/apk/res/android"';
const root = (inner) => `${HEAD}<LinearLayout ${NS}
    android:id="@+id/widget_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:background="@drawable/stackd_widget_bg"
    android:padding="14dp">
${inner}
</LinearLayout>
`;
const tv = (id, o = {}) => {
  const { size = 13, color = 'stackd_widget_text2', bold = false, w = 'wrap_content', weight = '', gravity = '', lines = 1, extra = '' } = o;
  return `<TextView android:id="@+id/${id}" android:layout_width="${w}" android:layout_height="wrap_content"${weight}
    android:textSize="${size}sp" android:textColor="@color/${color}"${bold ? ' android:textStyle="bold"' : ''}
    android:maxLines="${lines}" android:ellipsize="end"${gravity}${extra} />`;
};
const W1 = ' android:layout_weight="1"';
const GONE = ' android:visibility="gone"';
const header = `<LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal" android:gravity="center_vertical">
    ${tv('title', { size: 14, w: '0dp', weight: W1 })}
    ${tv('stale', { size: 12, color: 'stackd_widget_text3', extra: GONE })}
</LinearLayout>`;
const row = (n, o = {}) => `<LinearLayout android:id="@+id/row${n}" android:layout_width="match_parent" android:layout_height="wrap_content"
    android:paddingTop="${o.pad || 5}dp" android:paddingBottom="${o.pad || 5}dp"
    android:orientation="horizontal" android:gravity="center_vertical"${GONE}>
    <ImageView android:id="@+id/row${n}_mark" android:layout_width="28dp" android:layout_height="28dp" android:layout_marginEnd="10dp" android:importantForAccessibility="no" />
    <LinearLayout android:layout_width="0dp" android:layout_height="wrap_content"${W1} android:orientation="vertical">
        ${tv(`row${n}_name`, { size: 16, color: 'stackd_widget_text', w: 'match_parent' })}
        ${o.sub ? tv(`row${n}_sub`, { size: 13, w: 'match_parent', extra: GONE }) : ''}
    </LinearLayout>
    ${tv(`row${n}_value`, { size: 16, color: 'stackd_widget_text', bold: true, extra: ' android:layout_marginStart="8dp"' })}
</LinearLayout>`;
const rows = (count, o) => Array.from({ length: count }, (_, i) => row(i + 1, o)).join('\n');
const empty = tv('empty', { size: 15, w: 'match_parent', lines: 3, extra: GONE });

const files = {
  // W1 Account balances, W5 Upcoming
  stackd_widget_list: root(`${header}
${empty}
${tv('headline', { size: 26, color: 'stackd_widget_text', bold: true, extra: ' android:layout_marginTop="2dp" android:layout_marginBottom="4dp"' + GONE })}
<LinearLayout android:layout_width="match_parent" android:layout_height="0dp"${W1} android:orientation="vertical">
${rows(8, { sub: true })}
</LinearLayout>
${tv('more', { size: 13, extra: GONE })}`),

  // W2 Income vs Expenses
  stackd_widget_flow: root(`${header}
${empty}
${tv('headline', { size: 26, bold: true, color: 'stackd_widget_text', extra: ' android:layout_marginTop="2dp"' })}
${tv('caption', { size: 13 })}
<FrameLayout android:layout_width="match_parent" android:layout_height="0dp"${W1} />
<LinearLayout android:id="@+id/in_row" android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal" android:gravity="center_vertical">
    ${tv('in_label', { size: 15, w: '0dp', weight: W1 })}
    ${tv('in_value', { size: 16, bold: true, color: 'stackd_widget_income' })}
</LinearLayout>
<ImageView android:id="@+id/in_bar" android:layout_width="match_parent" android:layout_height="6dp" android:layout_marginTop="3dp" android:layout_marginBottom="6dp" android:scaleType="fitXY" android:importantForAccessibility="no" />
<LinearLayout android:id="@+id/out_row" android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal" android:gravity="center_vertical">
    ${tv('out_label', { size: 15, w: '0dp', weight: W1 })}
    ${tv('out_value', { size: 16, bold: true, color: 'stackd_widget_expense' })}
</LinearLayout>
<ImageView android:id="@+id/out_bar" android:layout_width="match_parent" android:layout_height="6dp" android:layout_marginTop="3dp" android:scaleType="fitXY" android:importantForAccessibility="no" />`),

  // W3 Categories
  stackd_widget_ring: root(`${header}
<LinearLayout android:id="@+id/body" android:layout_width="match_parent" android:layout_height="0dp"${W1} android:orientation="horizontal" android:gravity="center_vertical" android:layout_marginTop="6dp">
    <FrameLayout android:layout_width="96dp" android:layout_height="96dp" android:layout_marginEnd="14dp">
        <ImageView android:id="@+id/ring" android:layout_width="match_parent" android:layout_height="match_parent" android:importantForAccessibility="no" />
        ${tv('ring_center', { size: 14, bold: true, color: 'stackd_widget_text', w: 'match_parent', gravity: ' android:gravity="center"', extra: ' android:layout_gravity="center" android:paddingStart="14dp" android:paddingEnd="14dp"' })}
    </FrameLayout>
    <LinearLayout android:layout_width="0dp" android:layout_height="wrap_content"${W1} android:orientation="vertical">
${rows(4, { pad: 3 })}
    </LinearLayout>
</LinearLayout>
${empty}`),

  // W4 Budget goals
  stackd_widget_budget: root(`${header}
<LinearLayout android:id="@+id/body" android:layout_width="match_parent" android:layout_height="0dp"${W1} android:orientation="vertical">
<LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal" android:gravity="bottom" android:layout_marginTop="2dp">
    ${tv('headline', { size: 22, bold: true, color: 'stackd_widget_text' })}
    ${tv('caption', { size: 13, w: '0dp', weight: W1, extra: ' android:layout_marginStart="6dp" android:layout_marginBottom="2dp"' })}
    ${tv('pct', { size: 16, bold: true, color: 'stackd_widget_text' })}
</LinearLayout>
<LinearLayout android:layout_width="match_parent" android:layout_height="0dp"${W1} android:orientation="vertical" android:layout_marginTop="4dp">
${[1, 2, 3].map(n => `<LinearLayout android:id="@+id/row${n}" android:layout_width="match_parent" android:layout_height="0dp"${W1} android:orientation="vertical" android:gravity="center_vertical"${GONE}>
    <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal">
        ${tv(`row${n}_name`, { size: 15, color: 'stackd_widget_text', w: '0dp', weight: W1 })}
        ${tv(`row${n}_value`, { size: 15, bold: true })}
    </LinearLayout>
    <ImageView android:id="@+id/row${n}_bar" android:layout_width="match_parent" android:layout_height="5dp" android:layout_marginTop="3dp" android:scaleType="fitXY" android:importantForAccessibility="no" />
</LinearLayout>`).join('\n')}
</LinearLayout>
</LinearLayout>
${empty}`),

  // W6 Balance curve
  stackd_widget_curve: root(`${header}
<LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal" android:gravity="bottom" android:layout_marginTop="2dp">
    ${tv('headline', { size: 26, bold: true, color: 'stackd_widget_text' })}
    ${tv('caption', { size: 15, bold: true, w: '0dp', weight: W1, gravity: ' android:gravity="end"', extra: ' android:layout_marginStart="8dp" android:layout_marginBottom="3dp"' })}
</LinearLayout>
<ImageView android:id="@+id/curve" android:layout_width="match_parent" android:layout_height="0dp"${W1} android:layout_marginTop="6dp" android:scaleType="fitXY" android:importantForAccessibility="no" />
${empty}`),

  // W7 Quick add: three filled circles, no labels (owner's version D)
  stackd_widget_quick: `${HEAD}<LinearLayout ${NS}
    android:id="@+id/widget_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="horizontal"
    android:gravity="center"
    android:background="@drawable/stackd_widget_bg"
    android:padding="10dp">
${[['expense', 'minus'], ['income', 'plus'], ['transfer', 'transfer']].map(([k, icon]) => `    <FrameLayout android:layout_width="0dp" android:layout_height="match_parent"${W1}>
        <ImageView android:id="@+id/btn_${k}" android:layout_width="44dp" android:layout_height="44dp" android:layout_gravity="center"
            android:background="@drawable/stackd_widget_circle_${k}" android:src="@drawable/stackd_widget_ic_${icon}" android:padding="11dp" />
    </FrameLayout>`).join('\n')}
</LinearLayout>
`,

  stackd_widget_placeholder: `${HEAD}<LinearLayout ${NS}
    android:id="@+id/widget_root"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:gravity="center"
    android:background="@drawable/stackd_widget_bg"
    android:padding="14dp">
    <TextView android:id="@+id/placeholder_text" android:layout_width="wrap_content" android:layout_height="wrap_content"
        android:textSize="14sp" android:textStyle="bold" android:textColor="@color/stackd_widget_text" android:gravity="center"
        android:text="@string/stackd_widget_open" />
</LinearLayout>
`
};
fs.mkdirSync(out, { recursive: true });
for (const [name, xml] of Object.entries(files)) fs.writeFileSync(path.join(out, name + '.xml'), xml);
console.log(Object.keys(files).join(', '));

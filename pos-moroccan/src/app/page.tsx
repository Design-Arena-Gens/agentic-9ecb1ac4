"use client";

import { useMemo, useRef, useState } from "react";
import {
  categories,
  menuItems,
  modifierGroups,
  combos,
  loyaltyTiers,
  paymentOptions,
  tables,
  type MenuItem,
  type ServiceMode,
} from "@/data/pos";

type ModifierSelections = Record<string, string[]>;

type CartLine = {
  id: string;
  source: "menu" | "combo";
  item: MenuItem;
  quantity: number;
  note: string;
  modifierSelections: ModifierSelections;
};

const MAD = new Intl.NumberFormat("ar-MA", {
  style: "currency",
  currency: "MAD",
  maximumFractionDigits: 2,
});

const serviceLabels: Record<ServiceMode, string> = {
  "dine-in": "داخل المحل",
  takeaway: "سفري",
  delivery: "توصيل",
};

const classNames = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

const defaultModifierSelections = (item: MenuItem): ModifierSelections => {
  const defaults: ModifierSelections = {};
  item.modifiers?.forEach((groupId) => {
    const group = modifierGroups.find((g) => g.id === groupId);
    if (!group) return;
    if (group.required && group.options.length > 0) {
      defaults[groupId] = [group.options[0].id];
    } else {
      defaults[groupId] = [];
    }
  });
  return defaults;
};

const cloneModifierSelections = (modifiers: ModifierSelections): ModifierSelections =>
  Object.fromEntries(
    Object.entries(modifiers).map(([key, values]) => [key, [...values]]),
  );

const getModifierOptionPrice = (optionId: string) => {
  for (const group of modifierGroups) {
    const option = group.options.find((opt) => opt.id === optionId);
    if (option) {
      return option.price;
    }
  }
  return 0;
};

const getModifierOptionName = (optionId: string) => {
  for (const group of modifierGroups) {
    const option = group.options.find((opt) => opt.id === optionId);
    if (option) {
      return option.name;
    }
  }
  return optionId;
};

const calculateLineSubTotal = (line: CartLine) => {
  const modifierTotal = Object.values(line.modifierSelections).reduce(
    (sum, ids) =>
      sum + ids.reduce((acc, optionId) => acc + getModifierOptionPrice(optionId), 0),
    0,
  );
  return (line.item.price + modifierTotal) * line.quantity;
};

export default function Home() {
  const [serviceMode, setServiceMode] = useState<ServiceMode>("dine-in");
  const [selectedCategory, setSelectedCategory] = useState<string>("specials");
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string>(tables[0]?.id ?? "");
  const [customerName, setCustomerName] = useState<string>("زبون واجهة");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string>(paymentOptions[0]?.id ?? "");
  const [discount, setDiscount] = useState<number>(0);
  const [activeCustomization, setActiveCustomization] = useState<{
    item: MenuItem;
    lineId?: string;
  } | null>(null);
  const [customQuantity, setCustomQuantity] = useState<number>(1);
  const [customNote, setCustomNote] = useState<string>("");
  const [customModifiers, setCustomModifiers] = useState<ModifierSelections>({});
  const lineCounter = useRef(0);

  const createLineId = () => {
    lineCounter.current += 1;
    return `line-${lineCounter.current}`;
  };

  const filteredMenu = useMemo(() => {
    const normalizedTerm = searchTerm.trim().toLowerCase();
    return menuItems.filter((item) => {
      const matchesCategory = item.categoryId === selectedCategory;
      const matchesSearch =
        normalizedTerm.length === 0 ||
        item.name.toLowerCase().includes(normalizedTerm) ||
        item.description.toLowerCase().includes(normalizedTerm) ||
        item.tags?.some((tag) => tag.toLowerCase().includes(normalizedTerm));
      const matchesTag = activeTag ? item.tags?.includes(activeTag) : true;
      return matchesCategory && matchesSearch && matchesTag;
    });
  }, [selectedCategory, searchTerm, activeTag]);

  const subtotal = cart.reduce((sum, line) => sum + calculateLineSubTotal(line), 0);
  const tvaRate = 0.1;
  const serviceCharge = serviceMode === "dine-in" ? subtotal * 0.05 : 0;
  const tax = subtotal * tvaRate;
  const total = subtotal + tax + serviceCharge - discount;

  const loyaltyPoints = 820;
  const nextTier = loyaltyTiers.find((tier) => tier.threshold > loyaltyPoints);
  const loyaltyProgress = nextTier
    ? Math.min((loyaltyPoints / nextTier.threshold) * 100, 100)
    : 100;

  const isCustomizationValid = useMemo(() => {
    if (!activeCustomization) return true;
    return !(
      activeCustomization.item.modifiers?.some((groupId) => {
        const group = modifierGroups.find((modifier) => modifier.id === groupId);
        if (!group?.required) return false;
        const selections = customModifiers[groupId] ?? [];
        return selections.length === 0;
      }) ?? false
    );
  }, [activeCustomization, customModifiers]);

  const handleAddItem = (item: MenuItem) => {
    setActiveCustomization({ item });
    setCustomQuantity(1);
    setCustomNote("");
    setCustomModifiers(defaultModifierSelections(item));
  };

  const handleEditLine = (line: CartLine) => {
    setActiveCustomization({ item: line.item, lineId: line.id });
    setCustomQuantity(line.quantity);
    setCustomNote(line.note);
    setCustomModifiers(cloneModifierSelections(line.modifierSelections));
  };

  const confirmCustomization = () => {
    if (!activeCustomization) return;
    const { item, lineId } = activeCustomization;

    const linePayload: CartLine = {
      id: lineId ?? createLineId(),
      source: item.id.startsWith("combo-") ? "combo" : "menu",
      item,
      quantity: customQuantity,
      note: customNote,
      modifierSelections: cloneModifierSelections(customModifiers),
    };

    setCart((current) => {
      if (lineId) {
        return current.map((line) => (line.id === lineId ? linePayload : line));
      }
      return [...current, linePayload];
    });

    setActiveCustomization(null);
    setCustomModifiers({});
    setCustomNote("");
    setCustomQuantity(1);
  };

  const quickAdd = (item: MenuItem, options?: { note?: string }) => {
    const defaults = defaultModifierSelections(item);
    const newLine: CartLine = {
      id: createLineId(),
      source: item.id.startsWith("combo-") ? "combo" : "menu",
      item,
      quantity: 1,
      note: options?.note ?? "",
      modifierSelections: defaults,
    };
    setCart((current) => [...current, newLine]);
  };

  const removeLine = (lineId: string) => {
    setCart((current) => current.filter((line) => line.id !== lineId));
  };

  const adjustQuantity = (lineId: string, delta: number) => {
    setCart((current) =>
      current
        .map((line) =>
          line.id === lineId
            ? { ...line, quantity: Math.max(1, line.quantity + delta) }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );
  };

  const handleModifierToggle = (groupId: string, optionId: string) => {
    setCustomModifiers((current) => {
      const group = modifierGroups.find((g) => g.id === groupId);
      if (!group) return current;
      const selections = current[groupId] ?? [];
      const already = selections.includes(optionId);

      if (already) {
        if (group.required && selections.length === 1) {
          return current;
        }
        return { ...current, [groupId]: selections.filter((id) => id !== optionId) };
      }

      if (group.maxSelections === 1) {
        return { ...current, [groupId]: [optionId] };
      }

      if (group.maxSelections && selections.length >= group.maxSelections) {
        const [, ...rest] = selections;
        return { ...current, [groupId]: [...rest, optionId] };
      }

      return { ...current, [groupId]: [...selections, optionId] };
    });
  };

  const addComboToCart = (comboId: string) => {
    const combo = combos.find((c) => c.id === comboId);
    if (!combo) return;
    const virtualItem: MenuItem = {
      id: `combo-${combo.id}`,
      name: combo.name,
      description: combo.description,
      price: combo.price,
      categoryId: "specials",
    };
    quickAdd(virtualItem, {
      note: `يشمل: ${combo.items
        .map((id) => menuItems.find((item) => item.id === id)?.name ?? id)
        .join("، ")}`,
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-6 py-8 lg:flex-row">
        <aside className="flex w-full shrink-0 flex-col gap-6 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg lg:w-72">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-300">كاشير</p>
                <h1 className="text-xl font-semibold">Casbah POS</h1>
              </div>
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-medium text-emerald-400">
                {serviceLabels[serviceMode]}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              نظام متكامل لإدارة كافيه ومطعم مغربي بواجهة حديثة.
            </p>
          </div>

          <div className="rounded-2xl bg-white/5 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              نوع الخدمة
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(serviceLabels) as ServiceMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setServiceMode(mode)}
                  className={classNames(
                    "rounded-xl border px-3 py-2 text-xs font-medium transition",
                    serviceMode === mode
                      ? "border-emerald-400 bg-emerald-500/10 text-emerald-300"
                      : "border-transparent bg-white/5 text-slate-300 hover:bg-white/10",
                  )}
                >
                  {serviceLabels[mode]}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-3">
              <span className="text-lg">🔍</span>
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="بحث عن طبق أو مكون"
                className="w-full bg-transparent text-sm text-slate-200 placeholder:text-slate-400 focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {["محلي", "نباتي", "جديد", "قهوة", "مناسب للمشاركة"].map((tag) => (
                <button
                  key={tag}
                  onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                  className={classNames(
                    "rounded-full px-3 py-1 text-xs transition",
                    activeTag === tag
                      ? "bg-amber-500 text-slate-900"
                      : "bg-white/10 text-slate-300 hover:bg-white/20",
                  )}
                >
                  #{tag}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              الفئات
            </p>
            <div className="grid grid-cols-2 gap-3">
              {categories.map((category) => (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id)}
                  className={classNames(
                    "group relative overflow-hidden rounded-2xl border px-3 py-4 text-left transition",
                    selectedCategory === category.id
                      ? "border-amber-400 bg-gradient-to-br from-amber-500/20 to-orange-500/20"
                      : "border-transparent bg-white/5 hover:bg-white/10",
                  )}
                >
                  <span className="text-2xl">{category.icon}</span>
                  <p className="mt-3 text-sm font-semibold text-slate-100">
                    {category.name}
                  </p>
                  <div className="absolute inset-0 opacity-0 transition group-hover:opacity-100">
                    <div className={classNames("absolute -inset-2 blur-3xl bg-gradient-to-br", category.color)} />
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
            <p className="text-xs font-semibold uppercase text-emerald-200">
              برنامج الولاء
            </p>
            <h3 className="mt-2 text-sm font-semibold text-emerald-100">
              {loyaltyPoints} نقطة متراكمة
            </h3>
            {nextTier ? (
              <p className="text-xs text-emerald-200/80">
                تبقى {nextTier.threshold - loyaltyPoints} نقطة للحصول على {nextTier.reward}
              </p>
            ) : (
              <p className="text-xs text-emerald-200/80">تم بلوغ أعلى مستوى</p>
            )}
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-emerald-500/20">
              <div className="h-full rounded-full bg-emerald-400" style={{ width: `${loyaltyProgress}%` }} />
            </div>
          </div>
        </aside>

        <main className="flex w-full flex-1 flex-col gap-6">
          <div className="flex flex-col justify-between gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-lg lg:flex-row lg:items-center">
            <div>
              <h2 className="text-2xl font-semibold text-slate-100">
                لوحة الطلبات السريعة
              </h2>
              <p className="text-sm text-slate-300">
                اختر الأطباق، عدل الإضافات، وراقب حالة الطاولات في لحظة.
              </p>
            </div>
            <div className="flex gap-3 text-xs text-slate-200">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2">
                <p className="font-semibold">الطاولات النشطة</p>
                <p className="text-emerald-300">{tables.filter((table) => table.occupied).length} / {tables.length}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2">
                <p className="font-semibold">قائمة اليوم</p>
                <p className="text-amber-300">{menuItems.filter((item) => item.popular).length} طبق مميز</p>
              </div>
            </div>
          </div>

          <section className="flex flex-col gap-6 lg:flex-row">
            <div className="flex-1 space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filteredMenu.map((item) => (
                  <div
                    key={item.id}
                    className="group relative flex h-full flex-col justify-between overflow-hidden rounded-3xl border border-white/5 bg-white/5 p-5 transition hover:border-amber-400 hover:bg-white/10"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-slate-300">{item.categoryId}</p>
                          <h3 className="mt-1 text-lg font-semibold text-slate-50">
                            {item.name}
                          </h3>
                        </div>
                        {item.popular && (
                          <span className="rounded-full bg-amber-400/20 px-3 py-1 text-xs font-medium text-amber-200">
                            الأكثر طلبًا
                          </span>
                        )}
                      </div>
                      <p className="mt-3 text-sm text-slate-300">
                        {item.description}
                      </p>
                      {item.tags && (
                        <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-slate-300">
                          {item.tags.map((tag) => (
                            <span key={tag} className="rounded-full bg-white/5 px-2 py-1">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="mt-6 flex items-center justify-between">
                      <div>
                        <p className="text-lg font-semibold text-amber-200">
                          {MAD.format(item.price)}
                        </p>
                        {item.spiceLevel && (
                          <p className="text-xs text-slate-400">
                            مستوى الحدة: {item.spiceLevel === "mild" ? "خفيف" : item.spiceLevel === "medium" ? "متوسط" : "حار"}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAddItem(item)}
                          className="rounded-full bg-amber-400/90 px-4 py-2 text-xs font-semibold text-slate-900 transition hover:bg-amber-300"
                        >
                          تخصيص
                        </button>
                        <button
                          onClick={() => quickAdd(item)}
                          className="rounded-full border border-white/20 px-4 py-2 text-xs font-semibold text-slate-200 hover:border-amber-300 hover:text-amber-200"
                        >
                          إضافة
                        </button>
                      </div>
                    </div>
                    <div className="pointer-events-none absolute -right-10 -top-16 h-28 w-28 rounded-full bg-gradient-to-br from-amber-500/20 to-orange-500/10 blur-2xl transition opacity-0 group-hover:opacity-100" />
                  </div>
                ))}
              </div>

              <div className="rounded-3xl border border-amber-500/30 bg-amber-500/10 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase text-amber-200">
                      عروض مغربية جاهزة
                    </p>
                    <h3 className="mt-1 text-lg font-semibold text-slate-900/80 md:text-slate-100">
                      إحجز تشكيلة كاملة بضغطة واحدة
                    </h3>
                  </div>
                  <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-slate-900/80 md:text-slate-900">
                    توفير يصل 15%
                  </span>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {combos.map((combo) => (
                    <div key={combo.id} className="rounded-2xl bg-white/15 p-4 text-slate-900/80 md:text-slate-100">
                      <h4 className="text-base font-semibold">{combo.name}</h4>
                      <p className="mt-1 text-xs text-slate-700/70 md:text-slate-300">
                        {combo.description}
                      </p>
                      <ul className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-600/80 md:text-slate-200">
                        {combo.items.map((id) => {
                          const item = menuItems.find((menu) => menu.id === id);
                          return <li key={id} className="rounded-full bg-white/20 px-2 py-1">{item?.name ?? id}</li>;
                        })}
                      </ul>
                      <div className="mt-4 flex items-center justify-between">
                        <p className="text-lg font-semibold text-amber-200">{MAD.format(combo.price)}</p>
                        <button
                          onClick={() => addComboToCart(combo.id)}
                          className="rounded-full bg-amber-400/90 px-3 py-2 text-xs font-bold text-slate-900 transition hover:bg-amber-300"
                        >
                          أضف الحزمة
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <aside className="w-full max-w-md space-y-6 rounded-3xl border border-white/10 bg-slate-950/60 p-6 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400">اسم الزبون</p>
                  <input
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">الطاولة</p>
                  <select
                    value={selectedTableId}
                    onChange={(event) => setSelectedTableId(event.target.value)}
                    className="mt-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  >
                    {tables.map((table) => (
                      <option key={table.id} value={table.id} className="bg-slate-900">
                        {table.name} · {table.zone} · {table.seats} مقاعد
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-4 rounded-2xl bg-white/5 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-100">قائمة الطلب</h3>
                  <span className="text-xs text-slate-300">{cart.length} عنصر</span>
                </div>
                <div className="space-y-3">
                  {cart.length === 0 && (
                    <p className="rounded-xl border border-dashed border-white/20 px-4 py-6 text-center text-xs text-slate-400">
                      لم يتم إضافة أي عنصر بعد. اختر طبقًا من القائمة.
                    </p>
                  )}
                  {cart.map((line) => (
                    <div key={line.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-100">{line.item.name}</p>
                          <p className="text-xs text-slate-400">
                            {MAD.format(calculateLineSubTotal({ ...line, quantity: 1 }))} / طبق
                          </p>
                        </div>
                        <button
                          onClick={() => removeLine(line.id)}
                          className="text-xs text-slate-400 transition hover:text-amber-300"
                        >
                          حذف
                        </button>
                      </div>
                      {Object.values(line.modifierSelections).some((value) => value.length > 0) && (
                        <ul className="mt-2 space-y-1 text-[11px] text-slate-300">
                          {Object.entries(line.modifierSelections).map(([groupId, values]) => {
                            if (values.length === 0) return null;
                            const group = modifierGroups.find((g) => g.id === groupId);
                            return (
                              <li key={groupId}>
                                <span className="font-semibold text-slate-200">{group?.name}:</span>{" "}
                                {values.map((optionId) => getModifierOptionName(optionId)).join("، ")}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      {line.note && (
                        <p className="mt-2 rounded-xl bg-slate-900/50 px-3 py-2 text-[11px] text-slate-300">
                          ملاحظات: {line.note}
                        </p>
                      )}
                      <div className="mt-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => adjustQuantity(line.id, -1)}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-lg text-slate-200 hover:border-amber-300 hover:text-amber-200"
                          >
                            −
                          </button>
                          <span className="min-w-[2rem] text-center text-sm font-semibold text-slate-100">
                            {line.quantity}
                          </span>
                          <button
                            onClick={() => adjustQuantity(line.id, 1)}
                            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-lg text-slate-200 hover:border-amber-300 hover:text-amber-200"
                          >
                            +
                          </button>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-amber-200">
                            {MAD.format(calculateLineSubTotal(line))}
                          </p>
                          <button
                            onClick={() => handleEditLine(line)}
                            className="text-xs text-slate-300 underline underline-offset-4 hover:text-amber-200"
                          >
                            تخصيص
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3 rounded-2xl bg-white/5 p-4">
                <div className="flex items-center justify-between text-sm text-slate-300">
                  <span>المجموع الجزئي</span>
                  <span>{MAD.format(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-slate-300">
                  <span>خدمة الطاولة</span>
                  <span>{MAD.format(serviceCharge)}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-slate-300">
                  <span>ضريبة القيمة المضافة (10%)</span>
                  <span>{MAD.format(tax)}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-slate-300">
                  <span>خصم الولاء</span>
                  <input
                    type="number"
                    value={discount}
                    min={0}
                    onChange={(event) => setDiscount(Number(event.target.value) || 0)}
                    className="w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-right text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  />
                </div>
                <div className="mt-3 flex items-center justify-between rounded-xl bg-emerald-500/10 px-3 py-3 text-sm font-semibold text-emerald-200">
                  <span>الإجمالي المستحق</span>
                  <span>{MAD.format(Math.max(total, 0))}</span>
                </div>
              </div>

              <div className="space-y-4 rounded-2xl bg-white/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  طرق الدفع
                </p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {paymentOptions.map((option) => (
                    <button
                      key={option.id}
                      onClick={() => setSelectedPaymentId(option.id)}
                      className={classNames(
                        "rounded-2xl border px-3 py-3 text-left transition",
                        selectedPaymentId === option.id
                          ? "border-emerald-400 bg-emerald-500/10 text-emerald-200"
                          : "border-white/5 bg-white/5 text-slate-200 hover:border-emerald-300/40",
                      )}
                    >
                      <p className="font-semibold">{option.name}</p>
                      <p className="text-[11px] text-slate-300/80">{option.type}</p>
                    </button>
                  ))}
                </div>
                <button className="w-full rounded-full bg-emerald-500/90 py-3 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400">
                  إنهاء الطلب وتحصيل {MAD.format(Math.max(total, 0))}
                </button>
                <button className="w-full rounded-full border border-white/20 py-3 text-sm font-semibold text-slate-100 hover:border-emerald-300/60">
                  حفظ كمسودة للطهاة
                </button>
              </div>
            </aside>
          </section>
        </main>
      </div>

      {activeCustomization && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 pb-8 pt-24">
          <div className="w-full max-w-2xl rounded-3xl border border-amber-400/30 bg-slate-950/95 p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-amber-200">تخصيص الطلب</p>
                <h3 className="text-lg font-semibold text-slate-50">
                  {activeCustomization.item.name}
                </h3>
                <p className="text-sm text-slate-300">
                  {activeCustomization.item.description}
                </p>
              </div>
              <button
                onClick={() => setActiveCustomization(null)}
                className="rounded-full border border-white/20 px-3 py-1 text-xs text-slate-300 hover:border-amber-300 hover:text-amber-200"
              >
                إغلاق
              </button>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold text-slate-400">الكمية</p>
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      onClick={() => setCustomQuantity((q) => Math.max(1, q - 1))}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-lg text-slate-200 hover:border-amber-300 hover:text-amber-200"
                    >
                      −
                    </button>
                    <span className="text-base font-semibold text-slate-100">{customQuantity}</span>
                    <button
                      onClick={() => setCustomQuantity((q) => q + 1)}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 text-lg text-slate-200 hover:border-amber-300 hover:text-amber-200"
                    >
                      +
                    </button>
                  </div>
                </div>

                {activeCustomization.item.modifiers?.map((groupId) => {
                  const group = modifierGroups.find((modifier) => modifier.id === groupId);
                  if (!group) return null;
                  const selections = customModifiers[groupId] ?? [];
                  return (
                    <div key={group.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-semibold text-slate-100">{group.name}</p>
                          {group.description && (
                            <p className="text-xs text-slate-400">{group.description}</p>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {group.required ? "إجباري" : "اختياري"}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {group.options.map((option) => (
                          <button
                            key={option.id}
                            onClick={() => handleModifierToggle(group.id, option.id)}
                            className={classNames(
                              "rounded-full border px-3 py-2 text-xs transition",
                              selections.includes(option.id)
                                ? "border-amber-300 bg-amber-400/20 text-amber-200"
                                : "border-white/10 bg-white/5 text-slate-200 hover:border-amber-200/40",
                            )}
                          >
                            <span>{option.name}</span>
                            {option.price > 0 && (
                              <span className="ml-2 text-[10px] text-amber-200/70">
                                +{MAD.format(option.price)}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs font-semibold text-slate-400">ملاحظات للطبخ</p>
                  <textarea
                    value={customNote}
                    onChange={(event) => setCustomNote(event.target.value)}
                    rows={6}
                    placeholder="بدون ملح، زيادة هريسة، تقديم بسرعة..."
                    className="mt-3 w-full rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
                  <p className="text-xs font-semibold uppercase text-emerald-200">
                    الملخص
                  </p>
                  <h4 className="mt-2 text-lg font-semibold text-emerald-100">
                    {customQuantity} × {activeCustomization.item.name}
                  </h4>
                  <p className="text-sm text-emerald-100/80">
                    {MAD.format(
                      calculateLineSubTotal({
                        id: "preview",
                        source: activeCustomization.item.id.startsWith("combo-") ? "combo" : "menu",
                        item: activeCustomization.item,
                        note: customNote,
                        quantity: customQuantity,
                        modifierSelections: customModifiers,
                      }),
                    )}
                  </p>
                  {!isCustomizationValid && (
                    <p className="mt-3 rounded-xl bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
                      الرجاء اختيار جميع الإضافات الإجبارية قبل تأكيد الطلب.
                    </p>
                  )}
                  <button
                    onClick={confirmCustomization}
                    disabled={!isCustomizationValid}
                    className={classNames(
                      "mt-4 w-full rounded-full py-2 text-sm font-semibold transition",
                      isCustomizationValid
                        ? "bg-emerald-400/90 text-slate-900 hover:bg-emerald-300"
                        : "cursor-not-allowed bg-emerald-500/20 text-emerald-200/60",
                    )}
                  >
                    تأكيد وإضافة إلى الطلب
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

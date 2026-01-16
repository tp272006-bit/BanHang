// ======================
// CONFIG
// ======================
const API_BASE = "http://localhost:3000";
const fmtMoney = (n) => (Number(n || 0)).toLocaleString("vi-VN") + " ₫";
const nowISO = () => new Date().toISOString();
const uid = (prefix) => prefix + Math.random().toString(16).slice(2) + Date.now().toString(16);

// ======================
// API HELPERS
// ======================
async function api(path, opts = {}) {
    const res = await fetch(API_BASE + path, {
        headers: { "Content-Type": "application/json" },
        ...opts
    });
    if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`API ${res.status}: ${text || res.statusText}`);
    }
    return res.json();
}

async function apiPing() {
    try {
        await api("/meta");
        setStatus(true);
    } catch {
        setStatus(false);
    }
}

function setStatus(ok) {
    const el = document.getElementById("apiStatus");
    el.textContent = ok ? "ONLINE" : "OFFLINE";
    el.parentElement.classList.toggle("online", ok);
}

// ======================
// STATE
// ======================
const state = {
    meta: null,
    seasonPests: [],
    articles: [],
    products: [],
    customers: [],
    orders: [],

    productQuery: "",
    productCategory: "",
    customerQuery: "",
    orderQuery: "",

    cart: [] // {productId, name, price, qty, lineTotal}
};

// ======================
// INIT
// ======================
document.getElementById("btnReload").addEventListener("click", loadAll);

document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        showView(btn.dataset.view);
    });
});

function showView(view) {
    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    document.getElementById(`view-${view}`).classList.remove("hidden");
}

async function loadAll() {
    await apiPing();

    // load
    const [meta, pests, articles, products, customers, orders] = await Promise.all([
        api("/meta"),
        api("/seasonPests"),
        api("/articles?_sort=updatedAt&_order=desc"),
        api("/products?_sort=updatedAt&_order=desc"),
        api("/customers?_sort=createdAt&_order=desc"),
        api("/orders?_sort=createdAt&_order=desc")
    ]);

    state.meta = meta;
    state.seasonPests = pests;
    state.articles = articles;
    state.products = products;
    state.customers = customers;
    state.orders = orders;

    // render
    document.getElementById("shopTitle").textContent = meta.shopName || "Vật Tư Nông Nghiệp Tiến Liên";
    renderCategoryChips();
    renderDashboard();
    renderProducts();
    renderCustomers();
    renderPOS();
    renderOrders();
}

window.addEventListener("load", loadAll);

// ======================
// DASHBOARD: PESTS + ARTICLES
// ======================
function renderDashboard() {
    // pests
    const pestList = document.getElementById("pestList");
    pestList.innerHTML = "";
    state.seasonPests.forEach(p => {
        const item = document.createElement("div");
        item.className = "item";
        item.innerHTML = `
      <div class="left">
        <div class="title">${escapeHtml(p.name)} <span class="badge">Rủi ro: ${escapeHtml(p.risk || "—")}</span></div>
        <div class="muted small">${escapeHtml(p.note || "")}</div>
      </div>
      <div class="actions">
        <button class="btn ghost" data-act="edit">Sửa</button>
        <button class="btn ghost" data-act="del">Xóa</button>
      </div>
    `;
        item.querySelector('[data-act="edit"]').addEventListener("click", () => openPestModal(p));
        item.querySelector('[data-act="del"]').addEventListener("click", () => deletePest(p));
        pestList.appendChild(item);
    });

    // articles
    const articleList = document.getElementById("articleList");
    articleList.innerHTML = "";
    state.articles.forEach(a => {
        const item = document.createElement("div");
        item.className = "item";
        item.innerHTML = `
      <div class="left">
        <div class="title">${escapeHtml(a.title)} <span class="badge">${escapeHtml(a.category || "bài")}</span></div>
        <div class="muted small">${escapeHtml((a.content || "").slice(0, 120))}${(a.content||"").length>120?"…":""}</div>
        <div class="muted small">Cập nhật: ${new Date(a.updatedAt).toLocaleString("vi-VN")}</div>
      </div>
      <div class="actions">
        <button class="btn ghost" data-act="edit">Sửa</button>
        <button class="btn ghost" data-act="del">Xóa</button>
      </div>
    `;
        item.querySelector('[data-act="edit"]').addEventListener("click", () => openArticleModal(a));
        item.querySelector('[data-act="del"]').addEventListener("click", () => deleteArticle(a));
        articleList.appendChild(item);
    });

    // buttons
    document.getElementById("btnAddPest").onclick = () => openPestModal(null);
    document.getElementById("btnAddArticle").onclick = () => openArticleModal(null);
}

async function deletePest(p) {
    if (!confirm(`Xóa sâu/bệnh: "${p.name}" ?`)) return;
    await api(`/seasonPests/${p.id}`, { method: "DELETE" });
    await loadAll();
}

async function deleteArticle(a) {
    if (!confirm(`Xóa bài: "${a.title}" ?`)) return;
    await api(`/articles/${a.id}`, { method: "DELETE" });
    await loadAll();
}

function openPestModal(pest) {
    const isEdit = !!pest;
    openModal({
        title: isEdit ? "Sửa sâu/bệnh" : "Thêm sâu/bệnh",
        body: `
      <div class="form">
        <div class="field">
          <label>Tên sâu/bệnh</label>
          <input class="input" id="m_pest_name" value="${escapeAttr(pest?.name || "")}" />
        </div>
        <div class="row">
          <div class="field">
            <label>Rủi ro</label>
            <select class="input" id="m_pest_risk">
              ${["thấp","trung bình","cao"].map(r => `<option ${pest?.risk===r?"selected":""}>${r}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Ghi chú</label>
            <input class="input" id="m_pest_note" value="${escapeAttr(pest?.note || "")}" />
          </div>
        </div>
      </div>
    `,
        footButtons: [
            { text: "Hủy", ghost: true, onClick: closeModal },
            { text: isEdit ? "Lưu" : "Thêm", onClick: async () => {
                    const payload = {
                        id: pest?.id || uid("p"),
                        name: val("m_pest_name"),
                        risk: val("m_pest_risk"),
                        note: val("m_pest_note")
                    };
                    if (!payload.name.trim()) return alert("Nhập tên sâu/bệnh!");
                    if (isEdit) {
                        await api(`/seasonPests/${pest.id}`, { method: "PUT", body: JSON.stringify(payload) });
                    } else {
                        await api(`/seasonPests`, { method: "POST", body: JSON.stringify(payload) });
                    }
                    closeModal();
                    await loadAll();
                }}
        ]
    });
}

function openArticleModal(article) {
    const isEdit = !!article;
    openModal({
        title: isEdit ? "Sửa bài hướng dẫn" : "Thêm bài hướng dẫn",
        body: `
      <div class="form">
        <div class="field">
          <label>Tiêu đề</label>
          <input class="input" id="m_art_title" value="${escapeAttr(article?.title || "")}" />
        </div>
        <div class="row">
          <div class="field">
            <label>Chuyên mục</label>
            <input class="input" id="m_art_cat" value="${escapeAttr(article?.category || "sâu bệnh")}" />
          </div>
          <div class="field">
            <label>Tags (cách nhau dấu phẩy)</label>
            <input class="input" id="m_art_tags" value="${escapeAttr((article?.tags || []).join(", "))}" />
          </div>
        </div>
        <div class="field">
          <label>Nội dung</label>
          <textarea class="input" id="m_art_content" rows="8">${escapeHtml(article?.content || "")}</textarea>
        </div>
      </div>
    `,
        footButtons: [
            { text: "Hủy", ghost: true, onClick: closeModal },
            { text: isEdit ? "Lưu" : "Thêm", onClick: async () => {
                    const payload = {
                        id: article?.id || uid("a"),
                        title: val("m_art_title"),
                        category: val("m_art_cat"),
                        tags: val("m_art_tags").split(",").map(s => s.trim()).filter(Boolean),
                        content: document.getElementById("m_art_content").value,
                        createdAt: article?.createdAt || nowISO(),
                        updatedAt: nowISO()
                    };
                    if (!payload.title.trim()) return alert("Nhập tiêu đề!");
                    if (!payload.content.trim()) return alert("Nhập nội dung!");
                    if (isEdit) {
                        await api(`/articles/${article.id}`, { method: "PUT", body: JSON.stringify(payload) });
                    } else {
                        await api(`/articles`, { method: "POST", body: JSON.stringify(payload) });
                    }
                    closeModal();
                    await loadAll();
                }}
        ]
    });
}

// ======================
// PRODUCTS
// ======================
function renderCategoryChips() {
    const wrap = document.getElementById("categoryChips");
    wrap.innerHTML = "";
    const cats = (state.meta?.categories || []);
    cats.forEach(c => {
        const chip = document.createElement("button");
        chip.className = "chip" + (state.productCategory === c ? " active" : "");
        chip.textContent = c;
        chip.addEventListener("click", () => {
            state.productCategory = (state.productCategory === c) ? "" : c;
            renderCategoryChips();
            renderProducts();
        });
        wrap.appendChild(chip);
    });

    document.getElementById("productSearch").oninput = (e) => {
        state.productQuery = e.target.value;
        renderProducts();
    };
    document.getElementById("btnClearFilter").onclick = () => {
        state.productQuery = "";
        state.productCategory = "";
        document.getElementById("productSearch").value = "";
        renderCategoryChips();
        renderProducts();
    };
    document.getElementById("btnAddProduct").onclick = () => openProductModal(null);
}

function renderProducts() {
    const grid = document.getElementById("productGrid");
    grid.innerHTML = "";

    const q = state.productQuery.trim().toLowerCase();
    const cat = state.productCategory;

    const items = state.products.filter(p => {
        const okQ = !q || (p.name || "").toLowerCase().includes(q);
        const okC = !cat || p.category === cat;
        return okQ && okC;
    });

    items.forEach(p => {
        const img = (p.images && p.images[0]) ? p.images[0] : "";
        const card = document.createElement("div");
        card.className = "pcard";
        card.innerHTML = `
      <img class="pimg" src="${escapeAttr(img)}" alt="" onerror="this.style.display='none'"/>
      <div class="pbody">
        <div class="prow">
          <div class="title">${escapeHtml(p.name)}</div>
          <div class="money">${fmtMoney(p.price)}</div>
        </div>
        <div class="pmeta">
          <span class="badge">${escapeHtml(p.category || "—")}</span>
          <span class="badge">Tồn: ${escapeHtml(String(p.stock ?? 0))}</span>
          <span class="badge">Ảnh: ${escapeHtml(String((p.images||[]).length))}</span>
        </div>
        <div class="pdesc">${escapeHtml((p.description||"").slice(0,120))}${(p.description||"").length>120?"…":""}</div>
        <div class="actions">
          <button class="btn ghost" data-act="imgs">Xem ảnh</button>
          <button class="btn ghost" data-act="edit">Sửa</button>
          <button class="btn ghost" data-act="del">Xóa</button>
        </div>
      </div>
    `;
        card.querySelector('[data-act="imgs"]').addEventListener("click", () => openImagesModal(p));
        card.querySelector('[data-act="edit"]').addEventListener("click", () => openProductModal(p));
        card.querySelector('[data-act="del"]').addEventListener("click", () => deleteProduct(p));
        grid.appendChild(card);
    });

    // KPIs & low stock for POS view
    document.getElementById("kpiProducts").textContent = state.products.length;
    document.getElementById("kpiCustomers").textContent = state.customers.length;
    document.getElementById("kpiOrders").textContent = state.orders.length;

    renderLowStock();
}

async function deleteProduct(p) {
    if (!confirm(`Xóa sản phẩm: "${p.name}" ?`)) return;
    await api(`/products/${p.id}`, { method: "DELETE" });
    await loadAll();
}

function openImagesModal(p) {
    const imgs = (p.images || []).filter(Boolean);
    openModal({
        title: `Ảnh sản phẩm: ${p.name}`,
        body: `
      <div class="muted small">Mẹo: để thêm nhiều ảnh, mày nhập URL mỗi dòng trong form sản phẩm.</div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:10px">
        ${imgs.map(u => `
          <div class="card" style="padding:10px">
            <img src="${escapeAttr(u)}" style="width:100%;border-radius:14px;object-fit:cover" onerror="this.outerHTML='<div class=muted>Không tải được ảnh</div>'"/>
            <div class="muted small" style="margin-top:6px;word-break:break-all">${escapeHtml(u)}</div>
          </div>
        `).join("") || `<div class="muted">Chưa có ảnh.</div>`}
      </div>
    `,
        footButtons: [{ text: "Đóng", ghost: true, onClick: closeModal }]
    });
}

function openProductModal(product) {
    const isEdit = !!product;
    const cats = state.meta?.categories || [];
    openModal({
        title: isEdit ? "Sửa sản phẩm" : "Thêm sản phẩm",
        body: `
      <div class="form">
        <div class="row">
          <div class="field">
            <label>Danh mục</label>
            <select class="input" id="m_pr_cat">
              ${cats.map(c => `<option ${product?.category===c?"selected":""}>${c}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Tồn kho</label>
            <input class="input" id="m_pr_stock" type="number" min="0" value="${escapeAttr(String(product?.stock ?? 0))}" />
          </div>
        </div>

        <div class="field">
          <label>Tên sản phẩm</label>
          <input class="input" id="m_pr_name" value="${escapeAttr(product?.name || "")}" />
        </div>

        <div class="row">
          <div class="field">
            <label>Giá (VND)</label>
            <input class="input" id="m_pr_price" type="number" min="0" value="${escapeAttr(String(product?.price ?? 0))}" />
          </div>
          <div class="field">
            <label>Thêm ảnh từ máy (tùy chọn)</label>
            <input class="input" id="m_pr_files" type="file" accept="image/*" multiple />
            <div class="muted small">Ảnh sẽ lưu dạng base64 vào db.json (tiện nhưng file db có thể to).</div>
          </div>
        </div>

        <div class="field">
          <label>Ảnh (URL) - mỗi dòng 1 ảnh (có thể nhiều ảnh)</label>
          <textarea class="input" id="m_pr_images" rows="4" placeholder="https://...\nhttps://...">${escapeHtml((product?.images || []).join("\n"))}</textarea>
        </div>

        <div class="field">
          <label>Mô tả</label>
          <textarea class="input" id="m_pr_desc" rows="5">${escapeHtml(product?.description || "")}</textarea>
        </div>
      </div>
    `,
        footButtons: [
            { text: "Hủy", ghost: true, onClick: closeModal },
            { text: isEdit ? "Lưu" : "Thêm", onClick: async () => {
                    const base = {
                        id: product?.id || uid("pr"),
                        category: val("m_pr_cat"),
                        name: val("m_pr_name"),
                        price: Number(val("m_pr_price") || 0),
                        stock: Number(val("m_pr_stock") || 0),
                        description: document.getElementById("m_pr_desc").value,
                        images: val("m_pr_images").split("\n").map(s => s.trim()).filter(Boolean),
                        createdAt: product?.createdAt || nowISO(),
                        updatedAt: nowISO()
                    };

                    if (!base.name.trim()) return alert("Nhập tên sản phẩm!");
                    if (base.price < 0) return alert("Giá không hợp lệ!");
                    if (base.stock < 0) return alert("Tồn kho không hợp lệ!");

                    // Read optional local files -> base64 push to images
                    const files = document.getElementById("m_pr_files").files;
                    if (files && files.length) {
                        const b64s = await Promise.all([...files].map(fileToBase64));
                        base.images.push(...b64s);
                    }

                    if (isEdit) {
                        await api(`/products/${product.id}`, { method: "PUT", body: JSON.stringify(base) });
                    } else {
                        await api(`/products`, { method: "POST", body: JSON.stringify(base) });
                    }

                    closeModal();
                    await loadAll();
                }}
        ]
    });
}

// ======================
// CUSTOMERS
// ======================
function renderCustomers() {
    document.getElementById("btnAddCustomer").onclick = () => openCustomerModal(null);
    document.getElementById("customerSearch").oninput = (e) => {
        state.customerQuery = e.target.value;
        drawCustomerLists();
    };
    drawCustomerLists();
}

function drawCustomerLists() {
    const q = state.customerQuery.trim().toLowerCase();
    const list = document.getElementById("customerList");
    list.innerHTML = "";

    const filtered = state.customers.filter(c => {
        if (!q) return true;
        const hay = `${c.name||""} ${c.phone||""} ${c.commune||""} ${c.village||""}`.toLowerCase();
        return hay.includes(q);
    });

    filtered.forEach(c => {
        const item = document.createElement("div");
        item.className = "item";
        item.innerHTML = `
      <div class="left">
        <div class="title">${escapeHtml(c.name)} <span class="badge">${escapeHtml(c.phone || "")}</span></div>
        <div class="muted small">${escapeHtml(`${c.commune || ""} • ${c.village || ""} • ${c.addressDetail || ""}`)}</div>
      </div>
      <div class="actions">
        <button class="btn ghost" data-act="his">Lịch sử</button>
        <button class="btn ghost" data-act="edit">Sửa</button>
        <button class="btn ghost" data-act="del">Xóa</button>
      </div>
    `;
        item.querySelector('[data-act="his"]').addEventListener("click", () => openCustomerHistory(c));
        item.querySelector('[data-act="edit"]').addEventListener("click", () => openCustomerModal(c));
        item.querySelector('[data-act="del"]').addEventListener("click", () => deleteCustomer(c));
        list.appendChild(item);
    });

    // group by area
    const group = groupCustomersByArea(state.customers);
    const area = document.getElementById("areaGroup");
    area.innerHTML = "";
    Object.keys(group).sort().forEach(commune => {
        const villages = group[commune];
        const communeCount = Object.values(villages).reduce((acc, arr) => acc + arr.length, 0);
        const wrap = document.createElement("div");
        wrap.className = "item";
        wrap.innerHTML = `
      <div class="left">
        <div class="title">${escapeHtml(commune)} <span class="badge">${communeCount} khách</span></div>
        <div class="muted small">${Object.keys(villages).sort().map(v => `${escapeHtml(v)} (${villages[v].length})`).join(" • ")}</div>
      </div>
      <div class="actions">
        <button class="btn ghost" data-act="view">Xem</button>
      </div>
    `;
        wrap.querySelector('[data-act="view"]').addEventListener("click", () => openAreaModal(commune, villages));
        area.appendChild(wrap);
    });
}

function groupCustomersByArea(customers) {
    const map = {};
    customers.forEach(c => {
        const commune = (c.commune || "Chưa rõ xã").trim() || "Chưa rõ xã";
        const village = (c.village || "Chưa rõ thôn").trim() || "Chưa rõ thôn";
        map[commune] = map[commune] || {};
        map[commune][village] = map[commune][village] || [];
        map[commune][village].push(c);
    });
    return map;
}

function openAreaModal(commune, villages) {
    openModal({
        title: `Khu vực: ${commune}`,
        body: `
      ${Object.keys(villages).sort().map(v => {
            const arr = villages[v];
            return `
          <div class="card" style="padding:12px;margin-bottom:10px">
            <div class="card-title">${escapeHtml(v)} <span class="badge">${arr.length} khách</span></div>
            <div class="muted small" style="margin-top:6px">
              ${arr.map(c => `${escapeHtml(c.name)} (${escapeHtml(c.phone||"")})`).join(" • ")}
            </div>
          </div>
        `;
        }).join("")}
    `,
        footButtons: [{ text: "Đóng", ghost: true, onClick: closeModal }]
    });
}

async function deleteCustomer(c) {
    if (!confirm(`Xóa khách: "${c.name}" ? (Lịch sử giao dịch vẫn giữ trong orders)`)) return;
    await api(`/customers/${c.id}`, { method: "DELETE" });
    await loadAll();
}

function openCustomerModal(customer) {
    const isEdit = !!customer;
    openModal({
        title: isEdit ? "Sửa khách hàng" : "Thêm khách hàng",
        body: `
      <div class="form">
        <div class="row">
          <div class="field">
            <label>Tên</label>
            <input class="input" id="m_cus_name" value="${escapeAttr(customer?.name || "")}" />
          </div>
          <div class="field">
            <label>Số điện thoại</label>
            <input class="input" id="m_cus_phone" value="${escapeAttr(customer?.phone || "")}" />
          </div>
        </div>

        <div class="row">
          <div class="field">
            <label>Xã</label>
            <input class="input" id="m_cus_commune" value="${escapeAttr(customer?.commune || "")}" />
          </div>
          <div class="field">
            <label>Thôn</label>
            <input class="input" id="m_cus_village" value="${escapeAttr(customer?.village || "")}" />
          </div>
        </div>

        <div class="field">
          <label>Địa chỉ chi tiết</label>
          <input class="input" id="m_cus_addr" value="${escapeAttr(customer?.addressDetail || "")}" />
        </div>

        <div class="muted small">Tip: số điện thoại nên duy nhất để POS tự nhận khách.</div>
      </div>
    `,
        footButtons: [
            { text: "Hủy", ghost: true, onClick: closeModal },
            { text: isEdit ? "Lưu" : "Thêm", onClick: async () => {
                    const payload = {
                        id: customer?.id || uid("c"),
                        name: val("m_cus_name"),
                        phone: val("m_cus_phone"),
                        commune: val("m_cus_commune"),
                        village: val("m_cus_village"),
                        addressDetail: val("m_cus_addr"),
                        createdAt: customer?.createdAt || nowISO()
                    };
                    if (!payload.name.trim()) return alert("Nhập tên!");
                    if (!payload.phone.trim()) return alert("Nhập số điện thoại!");

                    // check phone duplicate (simple)
                    const dup = state.customers.find(x => x.phone === payload.phone && x.id !== payload.id);
                    if (dup) return alert("Số điện thoại đã tồn tại. Dùng số khác hoặc sửa khách đó.");

                    if (isEdit) {
                        await api(`/customers/${customer.id}`, { method: "PUT", body: JSON.stringify(payload) });
                    } else {
                        await api(`/customers`, { method: "POST", body: JSON.stringify(payload) });
                    }
                    closeModal();
                    await loadAll();
                }}
        ]
    });
}

function openCustomerHistory(c) {
    const orders = state.orders.filter(o => o.customerId === c.id || o.customerSnapshot?.phone === c.phone);
    openModal({
        title: `Lịch sử mua hàng: ${c.name} (${c.phone})`,
        body: `
      ${orders.map(o => `
        <div class="item">
          <div class="left">
            <div class="title">Đơn ${escapeHtml(o.id)} <span class="badge">${new Date(o.createdAt).toLocaleString("vi-VN")}</span></div>
            <div class="muted small">${o.items.map(i => `${escapeHtml(i.name)} x${i.qty}`).join(" • ")}</div>
          </div>
          <div class="money">${fmtMoney(o.total)}</div>
        </div>
      `).join("") || `<div class="muted">Chưa có giao dịch.</div>`}
    `,
        footButtons: [{ text: "Đóng", ghost: true, onClick: closeModal }]
    });
}

// ======================
// POS (BÁN HÀNG)
// ======================
function renderPOS() {
    const catSel = document.getElementById("posCategory");
    catSel.innerHTML = (state.meta?.categories || []).map(c => `<option>${c}</option>`).join("");
    catSel.onchange = () => renderPOSProducts();
    renderPOSProducts();

    document.getElementById("btnAddToCart").onclick = addToCart;
    document.getElementById("btnClearCart").onclick = clearCart;
    document.getElementById("btnCheckout").onclick = checkout;

    const phone = document.getElementById("posPhone");
    phone.addEventListener("keydown", (e) => {
        if (e.key === "Enter") lookupCustomerByPhone();
    });
    phone.addEventListener("blur", lookupCustomerByPhone);

    // KPIs + low stock are rendered in renderProducts()
    renderCart();
}

function renderPOSProducts() {
    const cat = document.getElementById("posCategory").value;
    const sel = document.getElementById("posProduct");
    const items = state.products.filter(p => p.category === cat);
    sel.innerHTML = items.map(p => {
        const disabled = (p.stock ?? 0) <= 0 ? "disabled" : "";
        return `<option value="${escapeAttr(p.id)}" ${disabled}>${escapeHtml(p.name)} (tồn: ${p.stock ?? 0})</option>`;
    }).join("");
}

function lookupCustomerByPhone() {
    const phone = document.getElementById("posPhone").value.trim();
    if (!phone) return;

    const c = state.customers.find(x => x.phone === phone);
    if (c) {
        document.getElementById("posName").value = c.name || "";
        document.getElementById("posCommune").value = c.commune || "";
        document.getElementById("posVillage").value = c.village || "";
        document.getElementById("posAddressDetail").value = c.addressDetail || "";
    }
}

function addToCart() {
    const productId = document.getElementById("posProduct").value;
    const qty = Number(document.getElementById("posQty").value || 1);

    const p = state.products.find(x => x.id === productId);
    if (!p) return alert("Chọn sản phẩm!");
    if (qty <= 0) return alert("Số lượng phải >= 1");
    if ((p.stock ?? 0) < qty) return alert(`Không đủ tồn kho. Hiện còn: ${p.stock ?? 0}`);

    const existed = state.cart.find(i => i.productId === productId);
    if (existed) {
        if ((p.stock ?? 0) < existed.qty + qty) return alert("Cộng thêm sẽ vượt tồn kho.");
        existed.qty += qty;
        existed.lineTotal = existed.qty * existed.price;
    } else {
        state.cart.push({
            productId,
            name: p.name,
            price: Number(p.price || 0),
            qty,
            lineTotal: Number(p.price || 0) * qty
        });
    }

    renderCart();
}

function clearCart() {
    if (!confirm("Xóa toàn bộ giỏ?")) return;
    state.cart = [];
    renderCart();
}

function renderCart() {
    const list = document.getElementById("cartList");
    list.innerHTML = "";

    state.cart.forEach((i, idx) => {
        const row = document.createElement("div");
        row.className = "item";
        row.innerHTML = `
      <div class="left">
        <div class="title">${escapeHtml(i.name)} <span class="badge">${fmtMoney(i.price)}</span></div>
        <div class="muted small">SL: ${i.qty} • Thành tiền: <b>${fmtMoney(i.lineTotal)}</b></div>
      </div>
      <div class="actions">
        <button class="btn ghost" data-act="minus">-</button>
        <button class="btn ghost" data-act="plus">+</button>
        <button class="btn ghost" data-act="del">Xóa</button>
      </div>
    `;
        row.querySelector('[data-act="minus"]').onclick = () => changeCartQty(idx, -1);
        row.querySelector('[data-act="plus"]').onclick = () => changeCartQty(idx, +1);
        row.querySelector('[data-act="del"]').onclick = () => removeCartItem(idx);
        list.appendChild(row);
    });

    const total = state.cart.reduce((acc, i) => acc + i.lineTotal, 0);
    document.getElementById("cartTotal").textContent = fmtMoney(total);
}

function changeCartQty(idx, delta) {
    const item = state.cart[idx];
    const p = state.products.find(x => x.id === item.productId);
    if (!p) return;

    const next = item.qty + delta;
    if (next <= 0) return;

    if ((p.stock ?? 0) < next) return alert("Vượt tồn kho!");
    item.qty = next;
    item.lineTotal = item.qty * item.price;
    renderCart();
}

function removeCartItem(idx) {
    state.cart.splice(idx, 1);
    renderCart();
}

async function checkout() {
    if (!state.cart.length) return alert("Giỏ hàng đang trống!");

    const phone = document.getElementById("posPhone").value.trim();
    const name = document.getElementById("posName").value.trim();
    const commune = document.getElementById("posCommune").value.trim();
    const village = document.getElementById("posVillage").value.trim();
    const addressDetail = document.getElementById("posAddressDetail").value.trim();
    const note = document.getElementById("posNote").value.trim();

    if (!phone) return alert("Nhập số điện thoại!");
    if (!name) return alert("Nhập tên khách!");

    // Find or create customer by phone
    let customer = state.customers.find(c => c.phone === phone);
    if (!customer) {
        customer = {
            id: uid("c"),
            name, phone, commune, village, addressDetail,
            createdAt: nowISO()
        };
        await api("/customers", { method: "POST", body: JSON.stringify(customer) });
    } else {
        // Update snapshot fields if user typed new info
        const updated = { ...customer, name, commune, village, addressDetail };
        await api(`/customers/${customer.id}`, { method: "PUT", body: JSON.stringify(updated) });
        customer = updated;
    }

    // Re-check stock and update products
    for (const i of state.cart) {
        const p = state.products.find(x => x.id === i.productId);
        if (!p) return alert("Có sản phẩm không tồn tại nữa. Tải lại dữ liệu.");
        if ((p.stock ?? 0) < i.qty) return alert(`Không đủ tồn: ${p.name}`);
    }

    // Create order
    const total = state.cart.reduce((acc, i) => acc + i.lineTotal, 0);
    const order = {
        id: uid("o"),
        customerId: customer.id,
        customerSnapshot: { name, phone, commune, village, addressDetail },
        items: state.cart.map(i => ({ ...i })),
        total,
        createdAt: nowISO(),
        note
    };
    await api("/orders", { method: "POST", body: JSON.stringify(order) });

    // Update product stocks
    for (const i of state.cart) {
        const p = state.products.find(x => x.id === i.productId);
        const updated = { ...p, stock: Number(p.stock || 0) - i.qty, updatedAt: nowISO() };
        await api(`/products/${p.id}`, { method: "PUT", body: JSON.stringify(updated) });
    }

    alert(`Xong! Tổng tiền: ${fmtMoney(total)}`);
    state.cart = [];
    document.getElementById("posNote").value = "";
    renderCart();
    await loadAll();
    showView("orders");
}

function renderLowStock() {
    const low = state.products
        .filter(p => Number(p.stock ?? 0) <= 5)
        .sort((a,b) => (a.stock ?? 0) - (b.stock ?? 0))
        .slice(0, 10);

    const el = document.getElementById("lowStockList");
    el.innerHTML = low.map(p => `
    <div class="item">
      <div class="left">
        <div class="title">${escapeHtml(p.name)} <span class="badge">${escapeHtml(p.category || "")}</span></div>
        <div class="muted small">Tồn: <b>${escapeHtml(String(p.stock ?? 0))}</b> • Giá: ${fmtMoney(p.price)}</div>
      </div>
      <div class="actions">
        <button class="btn ghost" onclick="window.__editProduct('${p.id}')">Sửa</button>
      </div>
    </div>
  `).join("") || `<div class="muted">Không có sản phẩm sắp hết.</div>`;

    // quick hook
    window.__editProduct = (id) => {
        const p = state.products.find(x => x.id === id);
        if (p) openProductModal(p);
    };
}

// ======================
// ORDERS
// ======================
function renderOrders() {
    document.getElementById("orderSearch").oninput = (e) => {
        state.orderQuery = e.target.value;
        drawOrders();
    };
    drawOrders();
}

function drawOrders() {
    const q = state.orderQuery.trim().toLowerCase();
    const list = document.getElementById("orderList");
    list.innerHTML = "";

    const items = state.orders.filter(o => {
        if (!q) return true;
        const c = o.customerSnapshot || {};
        const hay = `${c.name||""} ${c.phone||""}`.toLowerCase();
        return hay.includes(q);
    });

    items.forEach(o => {
        const c = o.customerSnapshot || {};
        const item = document.createElement("div");
        item.className = "item";
        item.innerHTML = `
      <div class="left">
        <div class="title">
          ${escapeHtml(c.name || "Khách")} <span class="badge">${escapeHtml(c.phone || "")}</span>
          <span class="badge">${new Date(o.createdAt).toLocaleString("vi-VN")}</span>
        </div>
        <div class="muted small">${escapeHtml(`${c.commune || ""} • ${c.village || ""} • ${c.addressDetail || ""}`)}</div>
        <div class="muted small">${o.items.map(i => `${escapeHtml(i.name)} x${i.qty}`).join(" • ")}</div>
        ${o.note ? `<div class="muted small"><b>Ghi chú:</b> ${escapeHtml(o.note)}</div>` : ""}
      </div>
      <div class="money">${fmtMoney(o.total)}</div>
    `;
        list.appendChild(item);
    });

    if (!items.length) list.innerHTML = `<div class="muted">Chưa có giao dịch phù hợp.</div>`;
}

// ======================
// MODAL
// ======================
function openModal({ title, body, footButtons }) {
    document.getElementById("modalTitle").textContent = title;
    document.getElementById("modalBody").innerHTML = body;

    const foot = document.getElementById("modalFoot");
    foot.innerHTML = "";
    (footButtons || []).forEach(b => {
        const btn = document.createElement("button");
        btn.className = "btn" + (b.ghost ? " ghost" : "");
        btn.textContent = b.text;
        btn.addEventListener("click", b.onClick);
        foot.appendChild(btn);
    });

    document.getElementById("modal").classList.remove("hidden");
}

function closeModal() {
    document.getElementById("modal").classList.add("hidden");
}

document.getElementById("btnCloseModal").onclick = closeModal;
document.getElementById("modalBackdrop").onclick = closeModal;

// ======================
// UTILS
// ======================
function val(id) { return (document.getElementById(id).value || "").trim(); }

function escapeHtml(s) {
    return String(s ?? "")
        .replaceAll("&","&amp;")
        .replaceAll("<","&lt;")
        .replaceAll(">","&gt;")
        .replaceAll('"',"&quot;")
        .replaceAll("'","&#039;");
}
function escapeAttr(s){ return escapeHtml(s).replaceAll("\n"," "); }

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const rd = new FileReader();
        rd.onload = () => resolve(rd.result);
        rd.onerror = reject;
        rd.readAsDataURL(file);
    });
}

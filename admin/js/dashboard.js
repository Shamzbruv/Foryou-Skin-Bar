import { supabase, checkAuth } from '/admin/js/supabase-client.js';

const COLORS = {
    gold: '#b8892f',
    goldSoft: 'rgba(184, 137, 47, 0.16)',
    sage: '#536b55',
    sageSoft: 'rgba(83, 107, 85, 0.14)',
    cocoa: '#5b4639',
    coral: '#a7654a',
    blue: '#55758c',
    red: '#a74c45',
    muted: '#8d847e',
    grid: 'rgba(50, 44, 40, 0.08)'
};

const state = {
    data: null,
    periodDays: 30,
    charts: []
};

const numberFormatter = new Intl.NumberFormat('en-JM');
const currencyNumberFormatter = new Intl.NumberFormat('en-JM', {
    maximumFractionDigits: 0
});
const dateFormatter = new Intl.DateTimeFormat('en-JM', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
});
const timeFormatter = new Intl.DateTimeFormat('en-JM', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit'
});

function byId(id) {
    return document.getElementById(id);
}

function asNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value) {
    return `J$${currencyNumberFormatter.format(asNumber(value))}`;
}

function formatCount(value) {
    return numberFormatter.format(asNumber(value));
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function parseDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function titleCase(value) {
    return String(value || 'unknown')
        .replaceAll('_', ' ')
        .replace(/\b\w/g, (character) => character.toUpperCase());
}

function statusClass(value) {
    return `status-${String(value || 'unknown').toLowerCase().replaceAll('_', '-')}`;
}

function isPaid(order) {
    return order?.payment_status === 'paid';
}

function isCancelled(order) {
    return ['cancelled', 'refunded'].includes(order?.status);
}

function isPaidSale(order) {
    return isPaid(order) && !isCancelled(order);
}

function needsFulfillment(order) {
    return isPaidSale(order)
        && !['delivered', 'picked_up'].includes(order?.fulfillment_status);
}

function isLowStock(product) {
    if (product?.status !== 'active' || product?.track_inventory === false) return false;
    return asNumber(product.stock_quantity) <= asNumber(product.low_stock_threshold ?? 5);
}

function unwrapResult(name, result, required = false) {
    if (result.error) {
        if (required) throw new Error(`${name}: ${result.error.message}`);
        console.warn(`[Dashboard] ${name} could not be loaded:`, result.error.message);
        return [];
    }
    return result.data || [];
}

async function fetchDashboardData() {
    const results = await Promise.all([
        supabase
            .from('orders')
            .select('id,order_number,status,payment_status,fulfillment_status,delivery_service,grand_total_jmd,created_at,customers(full_name)')
            .order('created_at', { ascending: false })
            .limit(5000),
        supabase
            .from('order_items')
            .select('id,order_id,product_id,product_name,unit_price_jmd,quantity,line_total_jmd')
            .limit(5000),
        supabase
            .from('products')
            .select('id,name,status,stock_quantity,low_stock_threshold,track_inventory')
            .order('name', { ascending: true })
            .limit(5000),
        supabase
            .from('newsletter_subscribers')
            .select('id,is_active,source,created_at')
            .order('created_at', { ascending: false })
            .limit(5000),
        supabase
            .from('blog_posts')
            .select('id,title,slug,status,published_at,created_at')
            .limit(1000),
        supabase.from('blog_likes').select('id,post_id,created_at').limit(5000),
        supabase.from('blog_comments').select('id,post_id,is_visible,created_at').limit(5000),
        supabase
            .from('payment_checkout_sessions')
            .select('id,status,grand_total_jmd,created_at')
            .order('created_at', { ascending: false })
            .limit(5000),
        supabase.from('contact_messages').select('id,status,created_at').limit(5000),
        supabase.from('product_reviews').select('id,approved,created_at').limit(5000)
    ]);

    return {
        orders: unwrapResult('Orders', results[0], true),
        items: unwrapResult('Order items', results[1]),
        products: unwrapResult('Products', results[2], true),
        subscribers: unwrapResult('Newsletter subscribers', results[3]),
        posts: unwrapResult('Blog posts', results[4]),
        likes: unwrapResult('Blog likes', results[5]),
        comments: unwrapResult('Blog comments', results[6]),
        checkouts: unwrapResult('Payment sessions', results[7]),
        messages: unwrapResult('Contact messages', results[8]),
        reviews: unwrapResult('Product reviews', results[9])
    };
}

function createBuckets(periodDays) {
    const now = new Date();

    if (periodDays <= 30) {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (periodDays - 1));
        const buckets = Array.from({ length: periodDays }, (_, index) => {
            const date = new Date(start);
            date.setDate(start.getDate() + index);
            return {
                start: date,
                label: new Intl.DateTimeFormat('en-JM', { day: 'numeric', month: 'short' }).format(date)
            };
        });
        return {
            start,
            buckets,
            indexFor(date) {
                const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                return Math.floor((day - start) / 86400000);
            }
        };
    }

    if (periodDays <= 90) {
        const count = 13;
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90);
        const buckets = Array.from({ length: count }, (_, index) => {
            const date = new Date(start);
            date.setDate(start.getDate() + (index * 7));
            return {
                start: date,
                label: new Intl.DateTimeFormat('en-JM', { day: 'numeric', month: 'short' }).format(date)
            };
        });
        return {
            start,
            buckets,
            indexFor(date) {
                return Math.floor((date - start) / (7 * 86400000));
            }
        };
    }

    const count = 12;
    const start = new Date(now.getFullYear(), now.getMonth() - (count - 1), 1);
    const buckets = Array.from({ length: count }, (_, index) => {
        const date = new Date(start.getFullYear(), start.getMonth() + index, 1);
        return {
            start: date,
            label: new Intl.DateTimeFormat('en-JM', { month: 'short', year: '2-digit' }).format(date)
        };
    });
    return {
        start,
        buckets,
        indexFor(date) {
            return ((date.getFullYear() - start.getFullYear()) * 12) + date.getMonth() - start.getMonth();
        }
    };
}

function periodData() {
    const buckets = createBuckets(state.periodDays);
    const start = buckets.start;
    const end = new Date();
    const previousStart = new Date(start.getTime() - (end.getTime() - start.getTime()));
    const inCurrentPeriod = (record) => {
        const date = parseDate(record?.created_at);
        return date && date >= start && date <= end;
    };
    const inPreviousPeriod = (record) => {
        const date = parseDate(record?.created_at);
        return date && date >= previousStart && date < start;
    };

    return {
        buckets,
        currentOrders: state.data.orders.filter(inCurrentPeriod),
        previousOrders: state.data.orders.filter(inPreviousPeriod),
        currentSubscribers: state.data.subscribers.filter(inCurrentPeriod),
        currentLikes: state.data.likes.filter(inCurrentPeriod),
        currentComments: state.data.comments.filter(inCurrentPeriod)
    };
}

function sumRevenue(orders) {
    return orders.filter(isPaidSale).reduce((sum, order) => sum + asNumber(order.grand_total_jmd), 0);
}

function setTrend(element, current, previous, noun) {
    element.classList.remove('trend-up', 'trend-down', 'trend-neutral');
    if (previous === 0) {
        if (current > 0) {
            element.textContent = `New ${noun} in this period`;
            element.classList.add('trend-up');
        } else {
            element.textContent = `No ${noun} in this or the previous period`;
            element.classList.add('trend-neutral');
        }
        return;
    }

    const change = ((current - previous) / previous) * 100;
    const direction = change >= 0 ? 'up' : 'down';
    element.textContent = `${Math.abs(change).toFixed(0)}% ${direction} from the previous period`;
    element.classList.add(change >= 0 ? 'trend-up' : 'trend-down');
}

function renderKpis(period) {
    const currentPaid = period.currentOrders.filter(isPaidSale);
    const previousPaid = period.previousOrders.filter(isPaidSale);
    const currentRevenue = sumRevenue(period.currentOrders);
    const previousRevenue = sumRevenue(period.previousOrders);
    const pendingFulfillment = state.data.orders.filter(needsFulfillment).length;
    const activeSubscribers = state.data.subscribers.filter((subscriber) => subscriber.is_active !== false).length;
    const lowStock = state.data.products.filter(isLowStock).length;

    byId('periodRevenueLabel').textContent = `Revenue (${state.periodDays === 365 ? '12 months' : `${state.periodDays} days`})`;
    byId('totalSales').textContent = formatCurrency(currentRevenue);
    byId('paidOrders').textContent = formatCount(currentPaid.length);
    byId('averageOrderValue').textContent = formatCurrency(currentPaid.length ? currentRevenue / currentPaid.length : 0);
    byId('pendingFulfillment').textContent = formatCount(pendingFulfillment);
    byId('activeSubscribers').textContent = formatCount(activeSubscribers);
    byId('lowStockCount').textContent = formatCount(lowStock);
    document.querySelectorAll('.loading-value').forEach((element) => element.classList.remove('loading-value'));

    setTrend(byId('totalSalesTrend'), currentRevenue, previousRevenue, 'revenue');
    setTrend(byId('paidOrdersTrend'), currentPaid.length, previousPaid.length, 'paid orders');
    byId('subscriberNote').textContent = `${formatCount(period.currentSubscribers.filter((subscriber) => subscriber.is_active !== false).length)} joined in the selected period`;
}

function destroyCharts() {
    state.charts.forEach((chart) => chart.destroy());
    state.charts = [];
}

function showChartEmpty(canvasId, emptyId, isEmpty) {
    byId(canvasId).hidden = isEmpty;
    byId(emptyId).hidden = !isEmpty;
}

function commonChartOptions() {
    return {
        responsive: true,
        maintainAspectRatio: false,
        animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 450 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: {
                labels: {
                    color: '#6d655f',
                    boxWidth: 9,
                    boxHeight: 9,
                    usePointStyle: true,
                    pointStyle: 'rectRounded',
                    padding: 16,
                    font: { family: 'Inter', size: 10, weight: 600 }
                }
            },
            tooltip: {
                backgroundColor: '#211e1c',
                titleFont: { family: 'Inter', size: 11 },
                bodyFont: { family: 'Inter', size: 11 },
                padding: 10,
                cornerRadius: 6,
                displayColors: true
            }
        },
        scales: {
            x: {
                grid: { display: false },
                border: { display: false },
                ticks: { color: '#8d847e', maxRotation: 0, autoSkip: true, maxTicksLimit: 8, font: { family: 'Inter', size: 9 } }
            },
            y: {
                beginAtZero: true,
                grid: { color: COLORS.grid },
                border: { display: false },
                ticks: { color: '#8d847e', font: { family: 'Inter', size: 9 } }
            }
        }
    };
}

function aggregateIntoBuckets(records, buckets, valueForRecord = () => 1) {
    const values = Array(buckets.buckets.length).fill(0);
    records.forEach((record) => {
        const date = parseDate(record.created_at);
        if (!date) return;
        const index = buckets.indexFor(date);
        if (index >= 0 && index < values.length) values[index] += valueForRecord(record);
    });
    return values;
}

function renderSalesChart(period) {
    const paidOrders = period.currentOrders.filter(isPaidSale);
    const revenue = aggregateIntoBuckets(paidOrders, period.buckets, (order) => asNumber(order.grand_total_jmd));
    const orderCounts = aggregateIntoBuckets(paidOrders, period.buckets);
    const hasData = paidOrders.length > 0;
    showChartEmpty('salesTrendChart', 'salesTrendEmpty', !hasData);
    byId('salesChartSummary').textContent = `${formatCurrency(sumRevenue(period.currentOrders))} from ${formatCount(paidOrders.length)} paid ${paidOrders.length === 1 ? 'order' : 'orders'}.`;
    if (!hasData) return;

    const options = commonChartOptions();
    options.scales.y.ticks.callback = (value) => value >= 1000 ? `J$${Math.round(value / 1000)}k` : `J$${value}`;
    options.scales.y1 = {
        position: 'right',
        beginAtZero: true,
        grid: { display: false },
        border: { display: false },
        ticks: { color: '#8d847e', precision: 0, stepSize: 1, font: { family: 'Inter', size: 9 } }
    };
    options.plugins.tooltip.callbacks = {
        label(context) {
            return context.dataset.yAxisID === 'y1'
                ? ` ${context.dataset.label}: ${formatCount(context.parsed.y)}`
                : ` ${context.dataset.label}: ${formatCurrency(context.parsed.y)}`;
        }
    };

    state.charts.push(new window.Chart(byId('salesTrendChart'), {
        type: 'line',
        data: {
            labels: period.buckets.buckets.map((bucket) => bucket.label),
            datasets: [
                {
                    label: 'Revenue',
                    data: revenue,
                    yAxisID: 'y',
                    borderColor: COLORS.gold,
                    backgroundColor: COLORS.goldSoft,
                    fill: true,
                    borderWidth: 2,
                    pointRadius: revenue.length > 15 ? 0 : 2,
                    pointHoverRadius: 4,
                    tension: 0.32
                },
                {
                    label: 'Paid orders',
                    data: orderCounts,
                    yAxisID: 'y1',
                    borderColor: COLORS.sage,
                    backgroundColor: COLORS.sage,
                    borderWidth: 2,
                    borderDash: [4, 4],
                    pointRadius: orderCounts.length > 15 ? 0 : 2,
                    pointHoverRadius: 4,
                    tension: 0.25
                }
            ]
        },
        options
    }));
}

function paymentGroups(orders) {
    const counts = { paid: 0, awaiting: 0, unpaid: 0, refunded: 0 };
    orders.forEach((order) => {
        const status = order.payment_status || 'unpaid';
        if (status === 'paid') counts.paid += 1;
        else if (status === 'refunded') counts.refunded += 1;
        else if (['awaiting_confirmation', 'partially_paid'].includes(status)) counts.awaiting += 1;
        else counts.unpaid += 1;
    });
    return counts;
}

function renderPaymentChart(period) {
    const counts = paymentGroups(period.currentOrders);
    const values = [counts.paid, counts.awaiting, counts.unpaid, counts.refunded];
    const labels = ['Paid', 'Awaiting', 'Unpaid', 'Refunded'];
    const colors = [COLORS.sage, COLORS.gold, COLORS.coral, COLORS.red];
    const hasData = values.some(Boolean);
    showChartEmpty('paymentStatusChart', 'paymentStatusEmpty', !hasData);
    byId('paymentLegend').innerHTML = hasData
        ? labels.map((label, index) => `<div><span><i style="background:${colors[index]}"></i>${label}</span><b>${formatCount(values[index])}</b></div>`).join('')
        : '';
    if (!hasData) return;

    state.charts.push(new window.Chart(byId('paymentStatusChart'), {
        type: 'doughnut',
        data: { labels, datasets: [{ data: values, backgroundColor: colors, borderColor: '#ffffff', borderWidth: 3, hoverOffset: 3 }] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#211e1c',
                    padding: 10,
                    cornerRadius: 6,
                    callbacks: { label: (context) => ` ${context.label}: ${formatCount(context.parsed)}` }
                }
            }
        }
    }));
}

function renderTopProductsChart(period) {
    const paidOrderIds = new Set(period.currentOrders.filter(isPaidSale).map((order) => order.id));
    const totals = new Map();
    state.data.items.forEach((item) => {
        if (!paidOrderIds.has(item.order_id)) return;
        const name = item.product_name || 'Unnamed product';
        const lineRevenue = asNumber(item.line_total_jmd) || (asNumber(item.unit_price_jmd) * asNumber(item.quantity));
        totals.set(name, (totals.get(name) || 0) + lineRevenue);
    });
    const rows = Array.from(totals, ([name, revenue]) => ({ name, revenue }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 6);
    showChartEmpty('topProductsChart', 'topProductsEmpty', rows.length === 0);
    if (!rows.length) return;

    const options = commonChartOptions();
    options.indexAxis = 'y';
    options.plugins.legend.display = false;
    options.plugins.tooltip.callbacks = { label: (context) => ` Revenue: ${formatCurrency(context.parsed.x)}` };
    options.scales.x.ticks.callback = (value) => value >= 1000 ? `J$${Math.round(value / 1000)}k` : `J$${value}`;
    options.scales.x.grid = { color: COLORS.grid };
    options.scales.y.grid = { display: false };
    options.scales.y.ticks = {
        color: '#5d5550',
        font: { family: 'Inter', size: 9, weight: 600 },
        callback(value) {
            const label = this.getLabelForValue(value);
            return label.length > 26 ? `${label.slice(0, 25)}...` : label;
        }
    };

    state.charts.push(new window.Chart(byId('topProductsChart'), {
        type: 'bar',
        data: {
            labels: rows.map((row) => row.name),
            datasets: [{ label: 'Revenue', data: rows.map((row) => row.revenue), backgroundColor: [COLORS.gold, COLORS.sage, COLORS.cocoa, COLORS.blue, COLORS.coral, '#8b8179'], borderRadius: 4, borderSkipped: false, barThickness: 18 }]
        },
        options
    }));
}

function renderFulfillmentChart(period) {
    const paidOrders = period.currentOrders.filter(isPaidSale);
    const labels = ['Unfulfilled', 'Packed', 'Shipped', 'Delivered', 'Picked up'];
    const keys = ['unfulfilled', 'packed', 'shipped', 'delivered', 'picked_up'];
    const values = keys.map((key) => paidOrders.filter((order) => (order.fulfillment_status || 'unfulfilled') === key).length);
    showChartEmpty('fulfillmentChart', 'fulfillmentEmpty', paidOrders.length === 0);
    if (!paidOrders.length) return;

    const options = commonChartOptions();
    options.plugins.legend.display = false;
    options.plugins.tooltip.callbacks = { label: (context) => ` Orders: ${formatCount(context.parsed.y)}` };
    options.scales.y.ticks.precision = 0;
    options.scales.y.ticks.stepSize = 1;

    state.charts.push(new window.Chart(byId('fulfillmentChart'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{ label: 'Orders', data: values, backgroundColor: [COLORS.gold, COLORS.blue, COLORS.cocoa, COLORS.sage, '#7d916f'], borderRadius: 4, borderSkipped: false, maxBarThickness: 42 }]
        },
        options
    }));
}

function renderEngagementChart(period) {
    const subscribers = aggregateIntoBuckets(period.currentSubscribers.filter((subscriber) => subscriber.is_active !== false), period.buckets);
    const likes = aggregateIntoBuckets(period.currentLikes, period.buckets);
    const comments = aggregateIntoBuckets(period.currentComments.filter((comment) => comment.is_visible !== false), period.buckets);
    const hasData = [...subscribers, ...likes, ...comments].some(Boolean);
    showChartEmpty('engagementChart', 'engagementEmpty', !hasData);
    if (!hasData) return;

    const options = commonChartOptions();
    options.scales.y.ticks.precision = 0;
    options.scales.y.ticks.stepSize = 1;
    options.plugins.tooltip.callbacks = { label: (context) => ` ${context.dataset.label}: ${formatCount(context.parsed.y)}` };

    state.charts.push(new window.Chart(byId('engagementChart'), {
        type: 'line',
        data: {
            labels: period.buckets.buckets.map((bucket) => bucket.label),
            datasets: [
                { label: 'New subscribers', data: subscribers, borderColor: COLORS.blue, backgroundColor: COLORS.blue, borderWidth: 2, pointRadius: subscribers.length > 15 ? 0 : 2, tension: 0.28 },
                { label: 'Blog likes', data: likes, borderColor: COLORS.gold, backgroundColor: COLORS.gold, borderWidth: 2, pointRadius: likes.length > 15 ? 0 : 2, tension: 0.28 },
                { label: 'Comments', data: comments, borderColor: COLORS.coral, backgroundColor: COLORS.coral, borderWidth: 2, pointRadius: comments.length > 15 ? 0 : 2, tension: 0.28 }
            ]
        },
        options
    }));
}

function renderActionCenter() {
    const pendingPayments = state.data.checkouts.filter((checkout) => checkout.status === 'pending').length;
    const unfulfilled = state.data.orders.filter(needsFulfillment).length;
    const lowStock = state.data.products.filter(isLowStock).length;
    const newMessages = state.data.messages.filter((message) => message.status === 'new').length;
    const pendingReviews = state.data.reviews.filter((review) => review.approved !== true).length;

    byId('pendingPaymentsAction').textContent = formatCount(pendingPayments);
    byId('unfulfilledAction').textContent = formatCount(unfulfilled);
    byId('lowStockAction').textContent = formatCount(lowStock);
    byId('newMessagesAction').textContent = formatCount(newMessages);
    byId('pendingReviewsAction').textContent = formatCount(pendingReviews);
}

function renderRecentOrders() {
    const body = byId('recentOrdersBody');
    const orders = state.data.orders.slice(0, 7);
    if (!orders.length) {
        body.innerHTML = '<tr><td colspan="6" class="table-loading">No orders have been created yet.</td></tr>';
        return;
    }

    body.innerHTML = orders.map((order) => {
        const createdAt = parseDate(order.created_at);
        const payment = order.payment_status || 'unpaid';
        const fulfillment = order.fulfillment_status || 'unfulfilled';
        return `
            <tr>
                <td><a href="/admin/orders.html">${escapeHtml(order.order_number || 'Order')}</a></td>
                <td>${escapeHtml(order.customers?.full_name || 'Manual customer')}</td>
                <td class="muted">${createdAt ? escapeHtml(dateFormatter.format(createdAt)) : '-'}</td>
                <td class="money">${escapeHtml(formatCurrency(order.grand_total_jmd))}</td>
                <td><span class="status-badge ${statusClass(payment)}">${escapeHtml(titleCase(payment))}</span></td>
                <td><span class="status-badge ${statusClass(fulfillment)}">${escapeHtml(titleCase(fulfillment))}</span></td>
            </tr>`;
    }).join('');
}

function renderInventoryAlerts() {
    const products = state.data.products
        .filter(isLowStock)
        .sort((a, b) => asNumber(a.stock_quantity) - asNumber(b.stock_quantity))
        .slice(0, 5);
    const container = byId('inventoryAlerts');
    if (!products.length) {
        container.innerHTML = '<p class="empty-list"><i class="fas fa-circle-check"></i>All tracked products are above their thresholds.</p>';
        return;
    }
    container.innerHTML = products.map((product) => {
        const stock = asNumber(product.stock_quantity);
        const tone = stock <= 0 ? 'danger' : 'warning';
        return `<div class="ranked-item"><div><a href="/admin/inventory.html">${escapeHtml(product.name)}</a><small>Threshold: ${formatCount(product.low_stock_threshold ?? 5)}</small></div><span class="ranked-value ${tone}">${formatCount(stock)} left</span></div>`;
    }).join('');
}

function renderTopBlogs() {
    const likesByPost = new Map();
    const commentsByPost = new Map();
    state.data.likes.forEach((like) => likesByPost.set(like.post_id, (likesByPost.get(like.post_id) || 0) + 1));
    state.data.comments.filter((comment) => comment.is_visible !== false).forEach((comment) => commentsByPost.set(comment.post_id, (commentsByPost.get(comment.post_id) || 0) + 1));
    const rows = state.data.posts
        .filter((post) => post.status === 'published')
        .map((post) => ({
            ...post,
            likes: likesByPost.get(post.id) || 0,
            comments: commentsByPost.get(post.id) || 0
        }))
        .sort((a, b) => (b.likes + b.comments) - (a.likes + a.comments))
        .slice(0, 5);
    const container = byId('topBlogs');
    if (!rows.length) {
        container.innerHTML = '<p class="empty-list"><i class="fas fa-newspaper"></i>No published blog posts yet.</p>';
        return;
    }
    container.innerHTML = rows.map((post) => `
        <div class="ranked-item">
            <div><a href="/admin/blog.html">${escapeHtml(post.title)}</a><small>${formatCount(post.likes)} likes &middot; ${formatCount(post.comments)} comments</small></div>
            <span class="ranked-value">${formatCount(post.likes + post.comments)}</span>
        </div>`).join('');
}

function renderDashboard() {
    if (!state.data) return;
    const period = periodData();
    renderKpis(period);
    renderActionCenter();
    renderRecentOrders();
    renderInventoryAlerts();
    renderTopBlogs();

    destroyCharts();
    if (typeof window.Chart !== 'function') {
        throw new Error('The chart library did not load. Check the internet connection and refresh the dashboard.');
    }
    window.Chart.defaults.font.family = 'Inter';
    window.Chart.defaults.color = '#716862';
    renderSalesChart(period);
    renderPaymentChart(period);
    renderTopProductsChart(period);
    renderFulfillmentChart(period);
    renderEngagementChart(period);
}

function setLoading(isLoading) {
    const refreshButton = byId('refreshDashboard');
    refreshButton.disabled = isLoading;
    refreshButton.classList.toggle('is-refreshing', isLoading);
    if (isLoading && !state.data) {
        document.querySelectorAll('.kpi-value').forEach((element) => element.classList.add('loading-value'));
    }
}

function showError(error) {
    byId('dashboardErrorMessage').textContent = ` ${error.message || 'Please try again.'}`;
    byId('dashboardError').hidden = false;
}

function clearError() {
    byId('dashboardError').hidden = true;
    byId('dashboardErrorMessage').textContent = '';
}

async function loadDashboard() {
    setLoading(true);
    clearError();
    try {
        state.data = await fetchDashboardData();
        renderDashboard();
        byId('lastUpdated').textContent = `Updated ${timeFormatter.format(new Date())}`;
    } catch (error) {
        console.error('[Dashboard]', error);
        showError(error);
        byId('lastUpdated').textContent = 'Live data is temporarily unavailable';
    } finally {
        setLoading(false);
    }
}

function setSidebar(open) {
    document.body.classList.toggle('sidebar-open', open);
    byId('sidebarOverlay').setAttribute('aria-hidden', String(!open));
}

function bindEvents() {
    document.querySelectorAll('[data-period]').forEach((button) => {
        button.addEventListener('click', () => {
            state.periodDays = Number(button.dataset.period);
            document.querySelectorAll('[data-period]').forEach((candidate) => {
                const active = candidate === button;
                candidate.classList.toggle('active', active);
                candidate.setAttribute('aria-pressed', String(active));
            });
            try {
                renderDashboard();
            } catch (error) {
                showError(error);
            }
        });
    });

    byId('refreshDashboard').addEventListener('click', loadDashboard);
    byId('retryDashboard').addEventListener('click', loadDashboard);
    byId('openSidebarBtn').addEventListener('click', () => setSidebar(true));
    byId('closeSidebarBtn').addEventListener('click', () => setSidebar(false));
    byId('sidebarOverlay').addEventListener('click', () => setSidebar(false));
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') setSidebar(false);
    });
    window.addEventListener('resize', () => {
        if (window.innerWidth > 900) setSidebar(false);
    });

    byId('logoutBtn').addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.href = '/admin/login.html';
    });
}

async function init() {
    bindEvents();
    const session = await checkAuth();
    if (!session) return;
    await loadDashboard();
}

init();

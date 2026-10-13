# Couture dé Cywila - Enterprise Ecosystem

A complete, synchronized multi-department digital operating platform for **Couture dé Cywila** (Luxury Bespoke Tailoring, Ready-to-Wear & Garment Care).

---

## 📁 Architecture & Directory Structure

```text
couture-deploy/
├── index.html                   # Luxury marketing landing page
├── style.css                    # Luxury styling & navigation bar
├── netlify.toml                 # Netlify deployment, CSP & caching rules
├── .gitignore                   # Git exclusions
├── images/                      # Image assets (about.svg, logos, etc.)
├── shared/
│   ├── seed-data.js             # Master data seeder (tiers, services, staff, inventory)
│   └── ecosystem-bar.js         # Top navigation switcher across all 6 apps
├── portal/                      # ENTERPRISE APPS HUB (Central launcher & credentials guide)
│   └── index.html
├── shop/                        # APP 1: Customer Shop & Online Ordering
│   └── index.html
├── admin/                       # APP 2: Admin Portal / Control Room
│   └── index.html
├── staff/                       # APP 3: Staff Tasks & Earnings Workstation
│   └── index.html
├── accounting/                  # APP 4: Accounting Dashboard & Chart.js Visuals
│   └── index.html
├── notifications/               # APP 5: WhatsApp & SMS Notification Hub
│   └── index.html
└── loyalty/                     # APP 6: Customer Engagement & Promo Suite
    └── index.html

---



## 🚀 Quick Deployment Guide (GitHub + Netlify)

### Step 1: Initialize Git and Push to GitHub
In this folder:
```bash
git init
git add .
git commit -m "Initial commit of Couture de Cywila ecosystem"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo-name>.git
git push -u origin main
```

### Step 2: Connect to Netlify
1. Go to [app.netlify.com](https://app.netlify.com).
2. Click **Add new site** > **Import an existing project from GitHub**.
3. Select your repository.
4. Set **Publish directory** to `.` (root).
5. Click **Deploy Site**.

### Step 3: Connect Your Custom Domain
1. In Netlify: Go to **Site configuration** > **Domain management** > **Add a domain**.
2. Enter your custom domain (e.g., `couturedecywila.com`).
3. In your DNS provider (Namecheap, GoDaddy, Whogohost):
   - **Apex / Root (`@`)**: Add an **A Record** pointing to `75.2.60.5`.
   - **Subdomain (`www`)**: Add a **CNAME Record** pointing to `your-site-name.netlify.app`.
4. Netlify will issue a free automatic SSL certificate.

---

## 🔄 Resetting Demo Data
If you make test orders or edits and want to reset the database back to clean starter data:
- Visit **`/portal/`** and click the red **🔄 Reset Demo Data** button.

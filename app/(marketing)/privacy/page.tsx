export const metadata = { title: "Privacy Policy — ATP Fitness" };

const SECTIONS = [
  { title: "What we collect", body: "Account details for gym owners and staff (name, email, phone), and member data your gym enters (profiles, attendance, payments, medical notes where relevant to training)." },
  { title: "How it's used", body: "Solely to operate ATP Fitness for your gym: authentication, attendance tracking, billing, notifications, and the reports you generate. We don't use member data for advertising." },
  { title: "Storage & security", body: "Data is stored in Supabase (PostgreSQL) with row-level security scoping every record to its tenant, and photos are stored in Cloudinary. Access is role-restricted per our RBAC model." },
  { title: "Third parties", body: "We use email (SMTP) for transactional and marketing email and the Meta WhatsApp Cloud API for WhatsApp notifications. These providers process messages on our behalf and don't retain member data beyond delivery." },
  { title: "Your rights", body: "Gym owners can export or delete their tenant's data at any time from Settings. Members can request their personal data be removed by contacting their gym's administrator." },
  { title: "Contact", body: "Questions about this policy can be sent to privacy@atpfitness.in." },
];

export default function PrivacyPage() {
  return (
    <div className="container max-w-2xl px-6 py-20">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: July 2026</p>
      <div className="mt-10 space-y-8">
        {SECTIONS.map((s) => (
          <div key={s.title}>
            <h2 className="font-semibold">{s.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

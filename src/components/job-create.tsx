"use client";
import { useState } from "react";
import { RecordForm } from "./record-form";
import { jobFields } from "./fields";
export function JobCreate({
  customers,
  properties,
  customerId = "",
  propertyId = "",
}: {
  customers: { id: string; name: string }[];
  properties: { id: string; customerId: string; line1: string }[];
  customerId?: string;
  propertyId?: string;
}) {
  const [selected, setSelected] = useState(customerId);
  return (
    <>
      <label className="panel">
        Customer
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Select customer…</option>
          {customers.map((c) => (
            <option value={c.id} key={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <RecordForm
          key={selected}
          endpoint="/api/data/jobs"
          successPath="/jobs/:id"
          fields={[
            {
              name: "customerId",
              label: "Confirm customer",
              type: "select",
              required: true,
              options: customers
                .filter((c) => c.id === selected)
                .map((c) => ({ value: c.id, label: c.name })),
            },
            {
              name: "propertyId",
              label: "Property",
              type: "select",
              required: true,
              options: properties
                .filter((p) => p.customerId === selected)
                .map((p) => ({ value: p.id, label: p.line1 })),
            },
            ...jobFields,
          ]}
          initial={{ customerId: selected, propertyId }}
        />
      )}
    </>
  );
}

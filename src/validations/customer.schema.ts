import { contactSchema } from "./shared";

export const customerSchema = contactSchema.extend({
  phone: contactSchema.shape.phone.regex(/^\d*$/, "Customer contact number must contain digits only."),
});

import type { ReactNode } from "react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock, HelpCircle, Loader2, Mail } from "lucide-react";
import PageMeta from "@/components/PageMeta";
import { STATIC_SEO } from "@/config/seoMeta";
import { SUPPORT_EMAIL } from "@/lib/appConfig";
import { submitContact, ApiError, withRequestId } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import {
  appInputClassName,
  appPrimaryButtonClassName,
} from "@/components/app-ui/appButtonClasses";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  contactFormSchema,
  type ContactFormValues,
} from "@/lib/validation/contact";


const defaultValues: ContactFormValues = {
  name: "",
  email: "",
  subject: "",
  message: "",
};

const infoCardClassName =
  "rounded-xl border border-apex-outline-variant/15 bg-apex-surface-container-low p-5";

const formLabelClassName =
  "font-apex-body text-[10px] uppercase text-apex-on-surface-variant";

function IconChip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-3 flex size-10 items-center justify-center rounded-apex-lg border border-apex-outline-variant/15 bg-apex-surface-container text-apex-primary",
        className,
      )}
      aria-hidden
    >
      {children}
    </div>
  );
}

export default function Contact() {
  const [sentBanner, setSentBanner] = useState(false);
  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactFormSchema),
    defaultValues,
  });


  const mutation = useMutation({
    mutationFn: submitContact,
    onMutate: () => {
      setSentBanner(false);
    },
    onSuccess: () => {
      toast.success("Message sent", {
        description:
          "Your message is on its way. Our team will email you soon — usually within a few business days.",
      });
      setSentBanner(true);
      form.reset(defaultValues);
    },
    onError: (err: unknown) => {
      let description = withRequestId(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
        err,
      );
      if (err instanceof ApiError && err.status === 503) {
        description = `${description} You can also reach us at ${SUPPORT_EMAIL}.`;
      }
      toast.error("Could not send message", { description });
    },
  });

  function onSubmit(values: ContactFormValues) {
    mutation.mutate({
      name: values.name,
      email: values.email,
      subject: values.subject.trim() || undefined,
      message: values.message,
    });
  }

  const pending = mutation.isPending;

  return (
    <>
      <PageMeta
        title={STATIC_SEO.contact.title}
        description={STATIC_SEO.contact.description}
        path={STATIC_SEO.contact.path}
      />
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col space-y-8 px-6 py-8">
        <header>
          <h1 className="font-apex-headline text-3xl font-bold tracking-tight text-apex-on-surface">
            Contact us
          </h1>
          <p className="mt-1 max-w-2xl font-apex-body text-sm text-apex-on-surface-variant">
            Questions about your account, Apex Pro, or the product? Send a
            message and we&apos;ll reply by email. We typically respond within a
            few business days.
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-5 lg:items-start">
          <aside className="space-y-4 lg:col-span-2">
            <div className={infoCardClassName}>
              <IconChip>
                <Mail className="size-5" />
              </IconChip>
              <h2 className="font-apex-headline text-sm font-semibold text-apex-on-surface">
                Email us
              </h2>
              <p className="mt-2 font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                Prefer email directly? Reach us at{" "}
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="font-medium text-apex-primary underline underline-offset-2 transition-colors hover:text-apex-primary/80"
                >
                  {SUPPORT_EMAIL}
                </a>
                .
              </p>
            </div>

            <div className={infoCardClassName}>
              <IconChip>
                <Clock className="size-5" />
              </IconChip>
              <h2 className="font-apex-headline text-sm font-semibold text-apex-on-surface">
                Typical response
              </h2>
              <p className="mt-2 font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                Within a few business days. We&apos;ll follow up by email once
                your message is reviewed.
              </p>
            </div>

            <div className={infoCardClassName}>
              <IconChip>
                <HelpCircle className="size-5" />
              </IconChip>
              <h2 className="font-apex-headline text-sm font-semibold text-apex-on-surface">
                Check the FAQ
              </h2>
              <p className="mt-2 font-apex-body text-sm leading-relaxed text-apex-on-surface-variant">
                Plans, sessions, Apex Pro, and more — many common questions are
                already answered.
              </p>
              <p className="mt-3 font-apex-body text-sm text-apex-on-surface-variant">
                <Link
                  to="/faq"
                  className="text-apex-primary transition-colors hover:text-apex-primary/80"
                >
                  FAQ
                </Link>
                <span
                  className="mx-1.5 text-apex-on-surface-variant/50"
                  aria-hidden
                >
                  ·
                </span>
                <Link
                  to="/about"
                  className="text-apex-primary transition-colors hover:text-apex-primary/80"
                >
                  About us
                </Link>
              </p>
            </div>
          </aside>

          <div className="rounded-apex-lg bg-apex-surface-container-low p-6 sm:p-7 lg:col-span-3">
            {sentBanner && (
              <div
                className="mb-6 flex flex-col gap-3 rounded-apex-lg border border-apex-success/30 bg-apex-success/10 p-5 sm:flex-row sm:items-start sm:justify-between"
                role="status"
              >
                <div className="flex gap-3">
                  <CheckCircle2
                    className="mt-0.5 size-5 shrink-0 text-apex-success"
                    aria-hidden
                  />
                  <div>
                    <p className="font-apex-headline font-medium text-apex-success">
                      We received your message
                    </p>
                    <p className="mt-1 font-apex-body text-sm text-apex-on-surface-variant">
                      Support has been notified. Someone will follow up by email
                      shortly.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="shrink-0 self-end font-apex-body text-xs font-medium text-apex-on-surface-variant underline-offset-4 transition-colors hover:text-apex-on-surface hover:underline sm:self-start"
                  onClick={() => setSentBanner(false)}
                >
                  Dismiss
                </button>
              </div>
            )}

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-5"
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <label className={formLabelClassName}>Name</label>
                      <FormControl>
                        <Input
                          autoComplete="name"
                          maxLength={120}
                          disabled={pending}
                          placeholder="Your name"
                          className={appInputClassName}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="text-xs text-apex-error" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <label className={formLabelClassName}>Email</label>
                      <FormControl>
                        <Input
                          type="email"
                          autoComplete="email"
                          disabled={pending}
                          placeholder="you@example.com"
                          className={appInputClassName}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="text-xs text-apex-error" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="subject"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <label className={formLabelClassName}>
                        Subject{" "}
                        <span className="normal-case text-apex-on-surface-variant/70">
                          (optional)
                        </span>
                      </label>
                      <FormControl>
                        <Input
                          type="text"
                          maxLength={200}
                          disabled={pending}
                          placeholder="Brief summary"
                          className={appInputClassName}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage className="text-xs text-apex-error" />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem className="space-y-1">
                      <label className={formLabelClassName}>Message</label>
                      <FormControl>
                        <Textarea
                          maxLength={5000}
                          rows={6}
                          disabled={pending}
                          placeholder="How can we help? (at least 20 characters)"
                          className={cn(
                            appInputClassName,
                            "min-h-[120px] resize-none",
                          )}
                          {...field}
                        />
                      </FormControl>
                      <p className="font-apex-body text-xs text-apex-on-surface-variant">
                        Minimum 20 characters.
                      </p>
                      <FormMessage className="text-xs text-apex-error" />
                    </FormItem>
                  )}
                />

                <div className="pt-2">
                  <Button
                    type="submit"
                    disabled={pending}
                    className={cn(
                      "w-full min-w-40 sm:w-auto",
                      appPrimaryButtonClassName,
                    )}
                  >
                    {pending ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                        Sending…
                      </>
                    ) : (
                      "Send message"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </div>
      </div>
    </>
  );
}

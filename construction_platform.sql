-- Adminer 5.4.1 PostgreSQL 18.0 dump

DROP FUNCTION IF EXISTS "uuid_generate_v1";;
CREATE FUNCTION "uuid_generate_v1" () RETURNS uuid LANGUAGE c AS 'uuid_generate_v1';

DROP FUNCTION IF EXISTS "uuid_generate_v1mc";;
CREATE FUNCTION "uuid_generate_v1mc" () RETURNS uuid LANGUAGE c AS 'uuid_generate_v1mc';

DROP FUNCTION IF EXISTS "uuid_generate_v3";;
CREATE FUNCTION "uuid_generate_v3" (IN "namespace" uuid, IN "name" text) RETURNS uuid LANGUAGE c AS 'uuid_generate_v3';

DROP FUNCTION IF EXISTS "uuid_generate_v4";;
CREATE FUNCTION "uuid_generate_v4" () RETURNS uuid LANGUAGE c AS 'uuid_generate_v4';

DROP FUNCTION IF EXISTS "uuid_generate_v5";;
CREATE FUNCTION "uuid_generate_v5" (IN "namespace" uuid, IN "name" text) RETURNS uuid LANGUAGE c AS 'uuid_generate_v5';

DROP FUNCTION IF EXISTS "uuid_nil";;
CREATE FUNCTION "uuid_nil" () RETURNS uuid LANGUAGE c AS 'uuid_nil';

DROP FUNCTION IF EXISTS "uuid_ns_dns";;
CREATE FUNCTION "uuid_ns_dns" () RETURNS uuid LANGUAGE c AS 'uuid_ns_dns';

DROP FUNCTION IF EXISTS "uuid_ns_oid";;
CREATE FUNCTION "uuid_ns_oid" () RETURNS uuid LANGUAGE c AS 'uuid_ns_oid';

DROP FUNCTION IF EXISTS "uuid_ns_url";;
CREATE FUNCTION "uuid_ns_url" () RETURNS uuid LANGUAGE c AS 'uuid_ns_url';

DROP FUNCTION IF EXISTS "uuid_ns_x500";;
CREATE FUNCTION "uuid_ns_x500" () RETURNS uuid LANGUAGE c AS 'uuid_ns_x500';

CREATE TABLE "public"."bid_counts" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "entrepreneur_profile_id" uuid,
    "period_start" timestamp NOT NULL,
    "period_end" timestamp NOT NULL,
    "bids_used" integer DEFAULT '0',
    "bids_limit" integer DEFAULT '30',
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now(),
    CONSTRAINT "bid_counts_pkey" PRIMARY KEY ("id")
)
WITH (oids = false);

TRUNCATE "bid_counts";
INSERT INTO "bid_counts" ("id", "entrepreneur_profile_id", "period_start", "period_end", "bids_used", "bids_limit", "created_at", "updated_at") VALUES
('cc45ad2c-764b-4474-814b-8bfcd765189c',	'69943d68-b150-4b95-91b7-e3fc6863f059',	'2025-10-18 19:40:00.633',	'2025-11-17 19:40:00.633',	1,	30,	'2025-10-18 19:40:00.644259',	'2025-10-18 19:58:08.547524'),
('66892c1f-708a-41d9-baa9-ed6fa953ed4c',	'0b0e08ca-a167-497d-a86e-05c675419d46',	'2025-10-18 15:09:06.327',	'2025-11-17 15:09:06.327',	8,	30,	'2025-10-18 15:09:06.361108',	'2025-10-25 00:18:14.646461'),
('57754ad0-b413-4b4b-a668-ac0fc70f82b6',	'a1c15fe7-fbfa-4ef5-b327-d4e7efb90308',	'2025-10-25 21:49:06.852',	'2025-11-24 21:49:06.852',	0,	30,	'2025-10-25 21:49:06.870212',	'2025-10-25 21:49:06.870212'),
('e39787c1-4592-4dac-aa07-648c1eaec28f',	'0b0e08ca-a167-497d-a86e-05c675419d46',	'2025-10-25 22:13:02.484',	'2025-11-24 22:13:02.484',	0,	30,	'2025-10-25 22:13:02.516244',	'2025-10-25 22:13:02.516244'),
('d5ed56ab-cb33-4f06-9dc7-28b87715cb9e',	'0b0e08ca-a167-497d-a86e-05c675419d46',	'2025-10-25 22:29:02.176',	'2025-11-24 22:29:02.176',	0,	30,	'2025-10-25 22:29:02.190087',	'2025-10-25 22:29:02.190087'),
('d7818897-aebe-48cb-a860-b4983d93abdd',	'a1c15fe7-fbfa-4ef5-b327-d4e7efb90308',	'2025-10-25 22:31:48.48',	'2025-11-24 22:31:48.48',	0,	30,	'2025-10-25 22:31:48.494271',	'2025-10-25 22:31:48.494271'),
('ffb9eeae-b340-4036-8910-74877b5e6add',	'0b0e08ca-a167-497d-a86e-05c675419d46',	'2025-10-25 22:44:01.349',	'2025-11-24 22:44:01.349',	0,	30,	'2025-10-25 22:44:01.37165',	'2025-10-25 22:44:01.37165'),
('b2e60beb-a7de-4299-827a-959df60be531',	'30ef57c4-80ce-49bd-aba6-c2b151ba8589',	'2025-10-27 20:36:10.879',	'2025-11-26 20:36:10.879',	0,	30,	'2025-10-27 20:36:10.896024',	'2025-10-27 20:36:10.896024');

CREATE TABLE "public"."bids" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "job_id" uuid,
    "entrepreneur_id" uuid,
    "amount" numeric(12,2),
    "message" text,
    "status" character varying(50),
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now(),
    CONSTRAINT "bids_pkey" PRIMARY KEY ("id")
)
WITH (oids = false);

TRUNCATE "bids";
INSERT INTO "bids" ("id", "job_id", "entrepreneur_id", "amount", "message", "status", "created_at", "updated_at") VALUES
('13bb87f4-f9dc-47f8-bc65-49978fdc168c',	'2793bdfb-6543-4142-b768-589d587a3e8f',	'0b0e08ca-a167-497d-a86e-05c675419d46',	1100.00,	'Example message',	'approved',	'2025-10-25 00:18:14.610522',	'2025-10-25 00:21:38.333737'),
('77d8d70d-7754-4a30-bdba-60e1c03a5f79',	'9be9ad4d-61c6-4d1f-bb01-ff0505832308',	'0b0e08ca-a167-497d-a86e-05c675419d46',	6500.00,	'I have 10 years of roofing experience and can start next week. Licensed and insured with excellent references.',	'declined',	'2025-10-17 17:34:29.664574',	'2025-10-17 17:34:29.664574'),
('5a5bde43-41a6-4e1a-91ac-035cc31d4228',	'6a2d394e-3479-49ab-a732-5638e416e114',	'0b0e08ca-a167-497d-a86e-05c675419d46',	1500.00,	'Quick plumbing fix. Can complete in 1 day.',	'declined',	'2025-10-17 17:35:59.606779',	'2025-10-17 17:35:59.606779'),
('b0c459a9-b313-456e-a2ae-798e657eb212',	'750094cc-5f36-4a00-9b08-6e0710ce2248',	'0b0e08ca-a167-497d-a86e-05c675419d46',	4200.00,	'Certified electrician. All work guaranteed.',	'declined',	'2025-10-17 17:36:17.825259',	'2025-10-17 17:40:34.874803'),
('0aabff85-50f8-4931-bbc8-cfb4e3e18129',	'9be9ad4d-61c6-4d1f-bb01-ff0505832308',	'0b0e08ca-a167-497d-a86e-05c675419d46',	6500.00,	'I can complete this work professionally',	'declined',	'2025-10-19 15:39:58.177658',	'2025-10-19 15:39:58.177658'),
('6a778a75-b62d-4776-96d3-e1f15cac6c3a',	'c153d886-de05-4b0d-88d9-5f48616da061',	'0b0e08ca-a167-497d-a86e-05c675419d46',	777.00,	'Bid try 2',	'declined',	'2025-10-22 13:05:44.971294',	'2025-10-22 13:05:44.971294'),
('bc5e6312-1b9c-4a88-bc1e-1a9e696a5072',	'7d61293a-e3e8-40a9-9885-12f0762dcbaa',	'0b0e08ca-a167-497d-a86e-05c675419d46',	598.00,	'TESTING DEV 101',	'declined',	'2025-10-22 18:11:35.77843',	'2025-10-23 22:08:07.103857'),
('7da94247-4e5c-442d-a786-fa9c16104b19',	'25da84d1-e020-4dc6-ac4a-ba8fc24002ec',	'0b0e08ca-a167-497d-a86e-05c675419d46',	5000.00,	'I can complete this work',	'accepted',	'2025-10-18 17:46:41.249801',	'2025-10-18 17:46:41.249801'),
('6683556c-69ea-4687-9615-8c89bbc27b23',	'4eda72a3-0b9f-4701-8a84-cace8cfadde1',	'0b0e08ca-a167-497d-a86e-05c675419d46',	1100.00,	'I can fix your air condition in just 5 hours',	'accepted',	'2025-10-23 21:40:01.944926',	'2025-10-23 22:22:26.961164'),
('609fc3b1-b42f-410e-81bd-7703815ac292',	'7ac30907-7ca6-42ae-a438-75fd99dff755',	'0b0e08ca-a167-497d-a86e-05c675419d46',	2100.00,	'Message here',	'pending',	'2025-10-25 00:02:01.228612',	'2025-10-25 00:02:01.228612'),
('0774a097-feec-421a-bb35-9a482d413f1d',	'5b523d5e-bd13-4e36-8eae-1cf4944e10ca',	'0b0e08ca-a167-497d-a86e-05c675419d46',	1100.00,	'The message for the property owner.',	'pending',	'2025-10-25 00:06:47.582858',	'2025-10-25 00:06:47.582858');

CREATE TABLE "public"."budget_unlocks" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "entrepreneur_id" uuid,
    "job_id" uuid,
    "amount" numeric(12,2),
    "payment_id" text,
    "stripe_payment_intent_id" character varying(255),
    "status" character varying(50) DEFAULT 'succeeded',
    "unlocked_at" timestamp DEFAULT now(),
    "created_at" timestamp DEFAULT now(),
    CONSTRAINT "budget_unlocks_pkey" PRIMARY KEY ("id")
)
WITH (oids = false);

CREATE UNIQUE INDEX budget_unlocks_stripe_payment_intent_id_key ON public.budget_unlocks USING btree (stripe_payment_intent_id);

CREATE UNIQUE INDEX unique_entrepreneur_job ON public.budget_unlocks USING btree (entrepreneur_id, job_id);

TRUNCATE "budget_unlocks";
INSERT INTO "budget_unlocks" ("id", "entrepreneur_id", "job_id", "amount", "payment_id", "stripe_payment_intent_id", "status", "unlocked_at", "created_at") VALUES
('72cbf4b5-0890-4e3d-8ccb-de03cee3c2a4',	'0b0e08ca-a167-497d-a86e-05c675419d46',	'de3b1fe4-62c6-45a4-a1f2-d48463d5877e',	2000.00,	'pi_3SLyIZ5Dbv5aHRPT0yoVDfzc',	'pi_3SLyIZ5Dbv5aHRPT0yoVDfzc',	'succeeded',	'2025-10-25 11:37:48.082697',	'2025-10-25 11:37:48.082697'),
('5d453f8b-87e5-47ee-bcb2-643ab78f237c',	'0b0e08ca-a167-497d-a86e-05c675419d46',	'7d61293a-e3e8-40a9-9885-12f0762dcbaa',	2000.00,	'pi_3SLyRB5Dbv5aHRPT0IVAQCHt',	'pi_3SLyRB5Dbv5aHRPT0IVAQCHt',	'succeeded',	'2025-10-25 11:46:41.386422',	'2025-10-25 11:46:41.386422'),
('5257fc69-780c-40e7-a047-caeacdb49133',	'0b0e08ca-a167-497d-a86e-05c675419d46',	'7ac30907-7ca6-42ae-a438-75fd99dff755',	2000.00,	'pi_3SLyWL5Dbv5aHRPT15F1yAui',	'pi_3SLyWL5Dbv5aHRPT15F1yAui',	'succeeded',	'2025-10-25 11:52:01.527281',	'2025-10-25 11:52:01.527281'),
('da0efa46-4c00-4467-a192-a7a5c6865293',	'0b0e08ca-a167-497d-a86e-05c675419d46',	'c153d886-de05-4b0d-88d9-5f48616da061',	2000.00,	'pi_3SLyw45Dbv5aHRPT0kKleBTR',	'pi_3SLyw45Dbv5aHRPT0kKleBTR',	'succeeded',	'2025-10-25 12:18:37.234709',	'2025-10-25 12:18:37.234709'),
('93a4fd30-aced-49e1-928e-f4ce495caed9',	'0b0e08ca-a167-497d-a86e-05c675419d46',	'5b523d5e-bd13-4e36-8eae-1cf4944e10ca',	2000.00,	'pi_3SLz0Y5Dbv5aHRPT1xeNUtQX',	'pi_3SLz0Y5Dbv5aHRPT1xeNUtQX',	'succeeded',	'2025-10-25 12:23:15.102609',	'2025-10-25 12:23:15.102609'),
('cdb8bc7c-1a3b-4b72-aec7-ff94adb994e6',	'0b0e08ca-a167-497d-a86e-05c675419d46',	'750094cc-5f36-4a00-9b08-6e0710ce2248',	2000.00,	'pi_3SLz1p5Dbv5aHRPT0SOETQKS',	'pi_3SLz1p5Dbv5aHRPT0SOETQKS',	'succeeded',	'2025-10-25 12:24:33.798004',	'2025-10-25 12:24:33.798004'),
('0654b00a-a09e-4e7a-82e0-e8af2d43d888',	'0b0e08ca-a167-497d-a86e-05c675419d46',	'572b6b34-6a6d-42cc-b3a6-8cb84ff5ae7f',	2000.00,	'pi_3SLzBy5Dbv5aHRPT0azqFXVk',	'pi_3SLzBy5Dbv5aHRPT0azqFXVk',	'succeeded',	'2025-10-25 12:35:03.218083',	'2025-10-25 12:35:03.218083'),
('e1184ced-589e-4601-937b-3a2efc61775f',	'30ef57c4-80ce-49bd-aba6-c2b151ba8589',	'65b174c1-dde9-422e-8214-1889fbedc4d5',	2000.00,	'pi_3SMqRj5Dbv5aHRPT0LP2Ec8F',	'pi_3SMqRj5Dbv5aHRPT0LP2Ec8F',	'succeeded',	'2025-10-27 21:26:52.354341',	'2025-10-27 21:26:52.354341');

CREATE TABLE "public"."conversations" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "participant1_id" uuid,
    "participant2_id" uuid,
    "job_id" uuid,
    "last_message_at" timestamp DEFAULT now(),
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now(),
    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
)
WITH (oids = false);

TRUNCATE "conversations";

CREATE TABLE "public"."entrepreneur_profiles" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "user_id" uuid,
    "company_name" character varying(255),
    "license_number" character varying(100),
    "years_in_business" integer,
    "num_employees" integer,
    "address" text,
    "specializations" text[],
    "average_rating" numeric(3,2),
    "total_reviews" integer,
    "portfolio" jsonb,
    "subscription_plan" character varying(20),
    "subscription_start" timestamp,
    "subscription_end" timestamp,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now(),
    "image" text,
    CONSTRAINT "entrepreneur_profiles_pkey" PRIMARY KEY ("id")
)
WITH (oids = false);

CREATE UNIQUE INDEX entrepreneur_profiles_user_id_key ON public.entrepreneur_profiles USING btree (user_id);

TRUNCATE "entrepreneur_profiles";
INSERT INTO "entrepreneur_profiles" ("id", "user_id", "company_name", "license_number", "years_in_business", "num_employees", "address", "specializations", "average_rating", "total_reviews", "portfolio", "subscription_plan", "subscription_start", "subscription_end", "created_at", "updated_at", "image") VALUES
('69943d68-b150-4b95-91b7-e3fc6863f059',	'6672cc03-c854-4c81-89bc-d4011d76ceea',	'Test Construction Co',	'LIC-12345',	5,	NULL,	NULL,	'{Roofing,Plumbing}',	NULL,	NULL,	NULL,	'basic',	'2025-10-18 19:40:00.633',	'2025-11-17 19:40:00.633',	'2025-10-18 19:36:08.663436',	'2025-10-18 19:40:00.641815',	NULL),
('8a3499e0-bab5-420a-bde6-8d57ee2d9b58',	'933e4932-9877-4d09-bd8c-e17fd564c262',	'Innovate Builders',	'LIC-789456',	5,	20,	'123 Tech Avenue, Makati, PH',	'{Construction,Renovation}',	NULL,	NULL,	NULL,	'none',	NULL,	NULL,	'2025-10-25 13:42:58.999805',	'2025-10-25 13:42:58.999805',	NULL),
('1c0345a0-983e-4aa7-8360-978146e15c47',	'1c5c729c-5318-4ce1-90ae-8167c05f1956',	'JordanPangit',	'LIC-0568',	1,	2,	'San Quintin Pangasinan',	'{Kupal}',	NULL,	NULL,	NULL,	'none',	NULL,	NULL,	'2025-10-25 20:34:35.785386',	'2025-10-25 20:34:35.785386',	NULL),
('a1c15fe7-fbfa-4ef5-b327-d4e7efb90308',	'e98a7d82-70b6-4045-b912-f3a872412e94',	'MarketH',	'LIC-0570',	1,	20,	'Urdaneta Pangasinan',	'{Roofing,Watering}',	NULL,	NULL,	NULL,	'premium',	'2025-10-25 22:35:43.904',	'2025-11-24 22:35:43.904',	'2025-10-25 20:29:43.948929',	'2025-10-25 22:35:43.915781',	NULL),
('0b0e08ca-a167-497d-a86e-05c675419d46',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'John''s Construction Co.',	'LIC-12345',	10,	5,	'123 Builder St, Montreal',	'{Roofing,Plumbing,Electrical}',	4.80,	45,	NULL,	'basic',	'2025-10-25 22:44:01.349',	'2025-11-24 22:44:01.349',	'2025-10-17 16:51:28.40735',	'2025-10-25 22:44:01.370429',	NULL),
('9bc88495-d16a-4c4b-9f84-5f2ca0a5a6ee',	'269c6146-37c9-4e57-b9c2-314e9715389e',	'Cuteness nation',	'LIC-110703',	2,	5,	'ML of dawn',	'{"Work in presssure"}',	NULL,	NULL,	NULL,	'premium',	'2025-10-25 23:04:19.877',	'2025-11-24 23:04:19.877',	'2025-10-25 23:03:27.993756',	'2025-10-25 23:04:19.889751',	NULL),
('30ef57c4-80ce-49bd-aba6-c2b151ba8589',	'2997ff14-a07e-4eaa-8e23-64a7fee3f7be',	'c4',	'c4 license',	4,	4,	'c4 address',	'{"c4 skills"}',	NULL,	NULL,	NULL,	'basic',	'2025-10-27 20:36:10.879',	'2025-11-26 20:36:10.879',	'2025-10-27 20:24:08.786662',	'2025-10-27 20:36:10.894508',	NULL);

CREATE TABLE "public"."favorites" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "manager_id" uuid,
    "entrepreneur_id" uuid,
    "created_at" timestamp DEFAULT now(),
    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
)
WITH (oids = false);

TRUNCATE "favorites";

CREATE TABLE "public"."images" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "job_id" uuid,
    "review_id" uuid,
    "image_url" text NOT NULL,
    "uploaded_by" uuid,
    "caption" text,
    "created_at" timestamp DEFAULT now(),
    CONSTRAINT "images_pkey" PRIMARY KEY ("id")
)
WITH (oids = false);

TRUNCATE "images";

CREATE TABLE "public"."inspection_reports" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "property_id" uuid,
    "file_url" text,
    "uploaded_by" uuid,
    "uploaded_at" timestamp DEFAULT now(),
    CONSTRAINT "inspection_reports_pkey" PRIMARY KEY ("id")
)
WITH (oids = false);

TRUNCATE "inspection_reports";

CREATE TABLE "public"."jobs" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "property_id" uuid,
    "manager_id" uuid,
    "title" character varying(255),
    "description" text,
    "category" character varying(100),
    "urgency" character varying(50),
    "due_date" date,
    "estimated_duration_days" integer,
    "budget_min" numeric(12,2),
    "budget_max" numeric(12,2),
    "is_budget_hidden" boolean DEFAULT false,
    "is_emergency" boolean DEFAULT false,
    "status" character varying(50),
    "unit_id" uuid,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now(),
    "entrepreneur_id" text,
    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
)
WITH (oids = false);

TRUNCATE "jobs";
INSERT INTO "jobs" ("id", "property_id", "manager_id", "title", "description", "category", "urgency", "due_date", "estimated_duration_days", "budget_min", "budget_max", "is_budget_hidden", "is_emergency", "status", "unit_id", "created_at", "updated_at", "entrepreneur_id") VALUES
('25da84d1-e020-4dc6-ac4a-ba8fc24002ec',	NULL,	'5248855c-3f36-4613-ae6a-919c774cef65',	'Roof Repair Needed',	'Replace damaged shingles on building roof',	'Roofing',	'Urgent (Current Year)',	'2025-12-31',	5,	5000.00,	8000.00,	't',	'f',	'accepted',	NULL,	'2025-10-17 14:38:41.930309',	'2025-10-17 14:38:41.930309',	NULL),
('4eda72a3-0b9f-4701-8a84-cace8cfadde1',	'c2735a88-c278-4bb6-8906-169391d836c8',	'5248855c-3f36-4613-ae6a-919c774cef65',	'Air Condition cleaning',	'Air Condition cleaning, cleaning and repairing',	'Electrical',	'Urgent (Current Year)',	'2025-11-01',	1,	1000.00,	1500.00,	't',	'f',	'ongoing',	NULL,	'2025-10-23 21:12:38.750971',	'2025-10-23 22:22:26.98242',	NULL),
('7ac30907-7ca6-42ae-a438-75fd99dff755',	'345cade6-6369-47ef-9b94-b6a69f3d5561',	'5248855c-3f36-4613-ae6a-919c774cef65',	'Window restoration',	'Broken window restoration',	'Other',	'Next Year',	'2025-11-15',	5,	2000.00,	3000.00,	'f',	'f',	'Open',	NULL,	'2025-10-24 23:51:30.952709',	'2025-10-24 23:51:30.952709',	NULL),
('5b523d5e-bd13-4e36-8eae-1cf4944e10ca',	'345cade6-6369-47ef-9b94-b6a69f3d5561',	'5248855c-3f36-4613-ae6a-919c774cef65',	'Job example 1',	'This is Job example 1',	'Roofing',	'Urgent (Current Year)',	'2025-11-07',	5,	1000.00,	2000.00,	't',	't',	'Open',	NULL,	'2025-10-25 00:03:59.013502',	'2025-10-25 00:03:59.013502',	NULL),
('2793bdfb-6543-4142-b768-589d587a3e8f',	'345cade6-6369-47ef-9b94-b6a69f3d5561',	'5248855c-3f36-4613-ae6a-919c774cef65',	'Job example 101',	'This is Job example 101',	'Electrical',	'Urgent (Current Year)',	'2025-10-24',	5,	1000.00,	3000.00,	'f',	'f',	'ongoing',	NULL,	'2025-10-25 00:10:48.801322',	'2025-10-25 00:21:38.346277',	NULL),
('de3b1fe4-62c6-45a4-a1f2-d48463d5877e',	'c2735a88-c278-4bb6-8906-169391d836c8',	'5248855c-3f36-4613-ae6a-919c774cef65',	'Job example 5',	'This Job example 5',	'Roofing',	'Next Year',	'2025-11-04',	17,	1232.00,	1234.00,	'f',	'f',	'Open',	NULL,	'2025-10-25 00:25:48.399216',	'2025-10-25 00:25:48.399216',	NULL),
('572b6b34-6a6d-42cc-b3a6-8cb84ff5ae7f',	'345cade6-6369-47ef-9b94-b6a69f3d5561',	'5248855c-3f36-4613-ae6a-919c774cef65',	'JOb example infinity 1',	'This is the JOb example infinity 1',	'Roofing',	'Urgent (Current Year)',	'2025-11-15',	13,	999.00,	11111.00,	'f',	'f',	'Open',	NULL,	'2025-10-25 12:26:03.274401',	'2025-10-25 12:26:03.274401',	NULL),
('79d91969-ebcb-4e64-962a-96296396e894',	'c2735a88-c278-4bb6-8906-169391d836c8',	'5248855c-3f36-4613-ae6a-919c774cef65',	'Job example inifinity 102',	'This is the Job example inifinity 102',	'Roofing',	'Next Year',	'2025-11-27',	7,	5679.00,	7890.00,	'f',	'f',	'Open',	NULL,	'2025-10-25 12:27:09.460777',	'2025-10-25 12:27:09.460777',	NULL),
('9be9ad4d-61c6-4d1f-bb01-ff0505832308',	'cbb01cc1-0c3d-4354-a982-f227946537c5',	'5248855c-3f36-4613-ae6a-919c774cef65',	'Roof Repair Needed',	'Replace damaged shingles on building roof',	'Roofing',	'Urgent (Current Year)',	'2025-12-31',	5,	5000.00,	8000.00,	't',	'f',	'Open',	NULL,	'2025-10-17 16:51:28.438803',	'2025-10-17 16:51:28.438803',	NULL),
('6a2d394e-3479-49ab-a732-5638e416e114',	'cbb01cc1-0c3d-4354-a982-f227946537c5',	'5248855c-3f36-4613-ae6a-919c774cef65',	'Plumbing Fix in Unit 302',	'Fix leaking pipes in kitchen',	'Plumbing',	'Next Year',	'2026-06-30',	2,	1000.00,	2000.00,	'f',	'f',	'Open',	NULL,	'2025-10-17 16:51:28.440614',	'2025-10-17 16:51:28.440614',	NULL),
('750094cc-5f36-4a00-9b08-6e0710ce2248',	'cbb01cc1-0c3d-4354-a982-f227946537c5',	'5248855c-3f36-4613-ae6a-919c774cef65',	'Electrical Upgrade',	'Upgrade electrical panel in basement',	'Electrical',	'Urgent (Current Year)',	'2025-08-30',	3,	3000.00,	5000.00,	't',	'f',	'Open',	NULL,	'2025-10-17 16:51:28.442458',	'2025-10-17 16:51:28.442458',	NULL),
('47b530cb-4bde-450f-9d67-8d6362e984fc',	'345cade6-6369-47ef-9b94-b6a69f3d5561',	'5248855c-3f36-4613-ae6a-919c774cef65',	'Job example inifinity 103',	'Job example inifinity 102',	'Electrical',	'Urgent (Current Year)',	'2025-11-08',	10,	34.00,	49.00,	'f',	'f',	'Open',	NULL,	'2025-10-25 12:27:41.651671',	'2025-10-25 12:27:41.651671',	NULL),
('65b174c1-dde9-422e-8214-1889fbedc4d5',	'345cade6-6369-47ef-9b94-b6a69f3d5561',	'5248855c-3f36-4613-ae6a-919c774cef65',	'Job example inifinity 104',	'Job example inifinity 104',	'Painting',	'Year After',	'2027-12-25',	82,	123213.00,	2131232.00,	'f',	'f',	'Open',	NULL,	'2025-10-25 12:28:21.121227',	'2025-10-25 12:28:21.121227',	NULL),
('7d61293a-e3e8-40a9-9885-12f0762dcbaa',	'345cade6-6369-47ef-9b94-b6a69f3d5561',	'5248855c-3f36-4613-ae6a-919c774cef65',	'Flooring',	'Flooring ngani',	'Other',	'Urgent (Current Year)',	'2025-10-24',	7,	500.00,	800.00,	't',	't',	'Open',	NULL,	'2025-10-22 11:19:50.035679',	'2025-10-22 11:19:50.035679',	NULL),
('c153d886-de05-4b0d-88d9-5f48616da061',	'345cade6-6369-47ef-9b94-b6a69f3d5561',	'5248855c-3f36-4613-ae6a-919c774cef65',	'ITO 1',	'ITO 1',	'Painting',	'Urgent (Current Year)',	'2025-11-07',	31,	666.00,	999.00,	't',	't',	'Open',	NULL,	'2025-10-22 11:23:23.605952',	'2025-10-22 11:23:23.605952',	NULL);

CREATE TABLE "public"."manager_profiles" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "user_id" uuid,
    "company_name" character varying(255),
    "address" text,
    "total_properties" integer,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now(),
    "image" text,
    CONSTRAINT "manager_profiles_pkey" PRIMARY KEY ("id")
)
WITH (oids = false);

CREATE UNIQUE INDEX manager_profiles_user_id_key ON public.manager_profiles USING btree (user_id);

TRUNCATE "manager_profiles";
INSERT INTO "manager_profiles" ("id", "user_id", "company_name", "address", "total_properties", "created_at", "updated_at", "image") VALUES
('aa6f7f53-228e-4e46-aca9-cd3a3b6be22a',	'dd197719-7816-4215-9bce-791273dd1181',	'ABC Property Management',	'123 Main St',	NULL,	'2025-10-17 14:36:15.078777',	'2025-10-17 14:36:15.078777',	NULL),
('5248855c-3f36-4613-ae6a-919c774cef65',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'ABC Property Management',	'456 Manager Ave, Montreal',	3,	'2025-10-17 16:51:28.433827',	'2025-10-17 16:51:28.433827',	NULL);

CREATE TABLE "public"."messages" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "conversation_id" uuid,
    "sender_id" uuid,
    "receiver_id" uuid,
    "job_id" uuid,
    "content" text NOT NULL,
    "is_read" boolean DEFAULT false,
    "read_at" timestamp,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now(),
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
)
WITH (oids = false);

TRUNCATE "messages";

CREATE TABLE "public"."properties" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "manager_id" uuid,
    "address" text,
    "city" character varying(100),
    "province" character varying(100),
    "postal_code" character varying(20),
    "num_units" integer,
    "building_type" character varying(50),
    "building_name" character varying(255),
    "description" text,
    "latitude" numeric(10,8),
    "longitude" numeric(11,8),
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now(),
    "image" text,
    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
)
WITH (oids = false);

TRUNCATE "properties";
INSERT INTO "properties" ("id", "manager_id", "address", "city", "province", "postal_code", "num_units", "building_type", "building_name", "description", "latitude", "longitude", "created_at", "updated_at", "image") VALUES
('cbb01cc1-0c3d-4354-a982-f227946537c5',	'5248855c-3f36-4613-ae6a-919c774cef65',	'789 Sunset Apartments',	'Montreal',	'Quebec',	'H3A 1A1',	10,	'Apartment',	NULL,	NULL,	NULL,	NULL,	'2025-10-17 16:51:28.436269',	'2025-10-17 16:51:28.436269',	NULL),
('8af57327-8cbd-4cb8-8485-5ce225185df4',	'5248855c-3f36-4613-ae6a-919c774cef65',	'123 Maple Street',	'Montreal',	'Quebec',	'H3A 1B1',	12,	'Apartment',	NULL,	NULL,	NULL,	NULL,	'2025-10-17 21:33:24.167105',	'2025-10-17 21:33:24.167105',	NULL),
('660df6d4-95ef-4691-8932-aa457d221d38',	'5248855c-3f36-4613-ae6a-919c774cef65',	'456 Oak Avenue',	'Montreal',	'Quebec',	'H2X 2Y5',	8,	'Condo',	NULL,	NULL,	NULL,	NULL,	'2025-10-17 21:34:00.042439',	'2025-10-17 21:34:00.042439',	NULL),
('9115985b-b9df-4a21-8e3c-7986438bb15f',	'5248855c-3f36-4613-ae6a-919c774cef65',	'789 Pine Road',	'Laval',	'Quebec',	'H7L 3N1',	20,	'Apartment',	NULL,	NULL,	NULL,	NULL,	'2025-10-17 21:34:08.317014',	'2025-10-17 21:34:08.317014',	NULL),
('594803f5-858f-4603-91cd-1bc99fe38288',	'5248855c-3f36-4613-ae6a-919c774cef65',	'1000 Rue de la Gauchetière Ouest',	'Montreal',	'Quebec',	'H3B 4W5',	50,	'Commercial',	NULL,	NULL,	45.49950000,	-73.56610000,	'2025-10-17 22:19:37.222726',	'2025-10-17 22:19:37.222726',	NULL),
('cb094979-91e3-42b6-a42c-202409d890b7',	'5248855c-3f36-4613-ae6a-919c774cef65',	'123 Main Street',	'Montreal',	'Quebec',	NULL,	50,	NULL,	NULL,	NULL,	NULL,	NULL,	'2025-10-19 15:38:27.048922',	'2025-10-19 15:38:27.048922',	NULL),
('69bc3891-695f-48ad-840f-693767206459',	'5248855c-3f36-4613-ae6a-919c774cef65',	'123 Main Street',	'Montreal',	'Quebec',	NULL,	50,	NULL,	NULL,	NULL,	NULL,	NULL,	'2025-10-19 15:39:58.031342',	'2025-10-19 15:39:58.031342',	NULL),
('9b9dc77a-04ff-43c0-9e6b-d4516bbfe15f',	'5248855c-3f36-4613-ae6a-919c774cef65',	'Basta sa Urdaneta',	'asdasd',	'asd',	'asdasd',	2,	'Commercial Building',	NULL,	NULL,	14.60835954,	121.00107819,	'2025-10-20 19:05:51.677843',	'2025-10-20 19:05:51.677843',	NULL),
('3c6f4a1a-b942-4acd-b61c-1638d92b45e2',	'5248855c-3f36-4613-ae6a-919c774cef65',	'Basta sa Urdaneta',	'Urdaneta',	'Pangasinan',	'2413',	2,	'Single Family',	NULL,	NULL,	15.97564391,	120.57072984,	'2025-10-20 19:16:05.962954',	'2025-10-20 19:16:05.962954',	NULL),
('56673cc6-b3d3-40e6-9dd7-48d8dab855e4',	'5248855c-3f36-4613-ae6a-919c774cef65',	'Basta sa Urdaneta',	'asdasd',	'Pangasinan',	'2413',	3,	'Student Housing',	NULL,	NULL,	14.61367506,	120.98951262,	'2025-10-20 19:22:52.460997',	'2025-10-20 19:22:52.460997',	NULL),
('d9bf7ce9-2512-4995-b667-9fa82b9b04cd',	'5248855c-3f36-4613-ae6a-919c774cef65',	'456 Bonifacio Avenue',	'Dagupan',	'Pangasinan',	'2400',	12,	'Condominium',	'silver building',	NULL,	16.04330000,	120.33330000,	'2025-10-20 21:06:07.825067',	'2025-10-20 21:06:07.825067',	NULL),
('eaa124e1-5653-480d-89c7-b0c2acfa7056',	'5248855c-3f36-4613-ae6a-919c774cef65',	'456 Bonifacio Avenue',	'Dagupan',	'Pangasinan',	'2400',	12,	'Condominium',	'silver building',	NULL,	16.04330000,	120.33330000,	'2025-10-20 21:08:52.62639',	'2025-10-20 21:08:52.62639',	NULL),
('04872a8e-df54-4c7c-8c5c-c81c29df1f95',	'5248855c-3f36-4613-ae6a-919c774cef65',	'dfsdf',	'sdf',	'sdf',	'232',	2,	'Apartment',	'sdsgr',	NULL,	9.23487507,	118.18062232,	'2025-10-22 11:17:42.553108',	'2025-10-22 11:17:42.553108',	NULL),
('345cade6-6369-47ef-9b94-b6a69f3d5561',	'5248855c-3f36-4613-ae6a-919c774cef65',	'dfsdf',	'dsad',	'dsad',	'2133',	0,	'Apartment',	'SILVER SUBD',	NULL,	14.73375443,	120.95999293,	'2025-10-22 11:18:42.589326',	'2025-10-22 11:18:42.589326',	NULL),
('c2735a88-c278-4bb6-8906-169391d836c8',	'5248855c-3f36-4613-ae6a-919c774cef65',	'"742 Evergreen Terrace, Springfield, IL 62704, USA"',	'742 Evergreen Terrace',	'Springfield',	'62704',	5,	'Apartment',	'Building ni Kwan',	NULL,	16.22981804,	119.84211664,	'2025-10-23 21:11:32.545085',	'2025-10-23 21:11:32.545085',	NULL),
('e6fe5ae9-35df-4f3c-a477-c7df894ab6b2',	'5248855c-3f36-4613-ae6a-919c774cef65',	'San Quintin Pangasinan',	'San Quintin',	'Pangasinan',	'4324',	18,	'Duplex',	'Property example',	NULL,	16.83083219,	121.86939538,	'2025-10-25 00:24:30.373269',	'2025-10-25 00:24:30.373269',	NULL);

CREATE TABLE "public"."refresh_tokens" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "user_id" uuid,
    "token" text NOT NULL,
    "expires_at" timestamp NOT NULL,
    "created_at" timestamp DEFAULT now(),
    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
)
WITH (oids = false);

CREATE UNIQUE INDEX refresh_tokens_token_key ON public.refresh_tokens USING btree (token);

TRUNCATE "refresh_tokens";
INSERT INTO "refresh_tokens" ("id", "user_id", "token", "expires_at", "created_at") VALUES
('a690b5ed-3f1d-403b-a070-eb1a0811e26e',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'2a96e30334ad515ecdedc3b32c3f90379b3188cccc7d799bed7ea42f5510f1f9228e553bf9da362400d56195164ac09d7b9149d8555bfb9e1281e62cdc6591a1',	'2025-10-29 10:40:46.144',	'2025-10-22 10:40:46.146029'),
('2d379dc4-8bd1-4c72-afff-a960fb330745',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'f83a43d83e924d35e1b32490ad63e0d63220c5fb662a8257c7dd8e7c39500a2d01ba1e72bac0b2b265aaffedda11bdf6fd9491558d1ab45fd44cfa400dea6f4d',	'2025-10-29 10:41:57.942',	'2025-10-22 10:41:57.944035'),
('a7cfa2d3-c90c-4d3d-827e-c56f9cb132b3',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'127747626b9a063a351ee2ae3b35a50d8ead7296bca026a624e2ff2f9c2274d4d3be39d49cf77d21c04be11d08dfd1e3eee97d8bd74f24a5d9d511eaed6184a9',	'2025-10-29 10:44:35.74',	'2025-10-22 10:44:35.745377'),
('ff4a7b23-a4eb-43a6-b8c0-1bab8d5ca7fd',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'270e83d7492c6bf09dd4333fa33afdd6a74bce87313a5db59d04eed516b36b3cc0388d716f2592e354281f7f58496532b4dc53f4b4d430dc8b603eb5f191fc9e',	'2025-10-29 10:45:51.631',	'2025-10-22 10:45:51.636518'),
('91908435-34b6-4131-b20c-8da8943b01c2',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'713de81acc240c8fc0e79d004719906a6a87b5b9c2510de9112c84466d989f78e4f9e83ff15d371be08d2f3fb7834b0151a314d2fa2a447c2f3b5113f9b15ca3',	'2025-10-29 10:47:58.275',	'2025-10-22 10:47:58.277604'),
('38e9ce3b-33dc-4214-b6f7-25828bcc1fb8',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'ec4a0892758e769c612bb75a397a997e4fc028c8d03ea543fb8bf029711ca6a0c0dc2c1d41cdd72f447866e3b5c9a04b6705097577f6f34324905d66a7b2b721',	'2025-10-29 10:48:44.307',	'2025-10-22 10:48:44.309726'),
('a87891cf-fa27-4523-84df-06e3e4ee1006',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'64212db95f54cf9291194d86d6dc0af0515cdd2abdeca7914523a6248920712c3cc678e172ffd3c4818d1cc218cf36a99ec130fa90cf974a6df9fec570dfb2fb',	'2025-10-29 11:08:00.022',	'2025-10-22 11:08:00.023472'),
('6aca2ccc-e048-4efe-89aa-cbf26672bc9b',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'e616a675f3c7c43b04543056c439092567616e08495a2be2e3c1e837fe7e368301d2fbc40c9388d7131c48bef4bb11852ee54d4ee45cfd2f5723750505396ad2',	'2025-10-29 11:08:47.313',	'2025-10-22 11:08:47.314297'),
('5cddf04f-b53c-4c42-8863-82f2782da674',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'4b7255c9a8c2536e951ee27e68b6828f786ed48538aac6103334c19d8f63600de403bbd80f4e2d32da2a33a5335ddd9e21d471c946c0b604c2a956ee2e93ab77',	'2025-10-29 11:20:14.829',	'2025-10-22 11:20:14.830304'),
('6c826c55-897e-4417-ba0b-61c27619a99e',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'70eb4c5dee885deff3229d4bea72e25969c0d85d6adba853ee95eca3700b78fab70b8d9a9eb7a868fe6d1eeb71c912d58950904752d06ca52e5513d3edf80baa',	'2025-10-29 11:22:40.706',	'2025-10-22 11:22:40.70771'),
('284ea68b-8b64-4f3d-a06b-3ac0ce6f00c7',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'aa53b19320984a26dd061c9c8249a514769566572222e8ab17d355a2343db69b294156b4f7cde4362a1e04068dec7b3331a11a298500ad5650dc3a138b77e403',	'2025-10-29 11:23:43.303',	'2025-10-22 11:23:43.304233'),
('bfc2b952-7572-4211-a1e4-1f92acdf70ea',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'df2cf14211525ecf1ddd1b3afbdb9813824616266e10b27c6666e9c153cfd36477db923642723d829fc1011313e7e4c80bcec04799dfb902ad475dc72ea1b12f',	'2025-10-29 11:27:17.467',	'2025-10-22 11:27:17.468332'),
('cf7fbc46-4082-426f-81e5-ffc304193461',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'7b2335a7b9d0fa46c04dbfca19439d703e29fe584dd58af3959007f6ca7153699864e89104a6bdaeef19779a383f4ea51342357b97a2f96c8425a920e1d7c2e9',	'2025-10-29 12:00:27.491',	'2025-10-22 12:00:27.491692'),
('c01528d7-c52b-4a18-9764-88dd1758f729',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'f03a19258074cea29e03cbaa93174ab2730666ba34fdff8750cbb8a74ffbece7e15e6f91a0120e37c4efab084b3102c020d9e03d4606dd10dc6fcb32ec1a874b',	'2025-10-29 12:01:00.347',	'2025-10-22 12:01:00.347681'),
('ab6d34fe-ce4f-4218-aad1-3154647f19a2',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'e28edf2209956d7e066b3ed4120f12c5a02d082c402d40f8b0c65a16c2e80796ad0f47dac7d18e5a4c7a61a958ddd702eb7012257e17083ce504bf96df207bbc',	'2025-10-29 12:04:43.085',	'2025-10-22 12:04:43.086634'),
('29435db7-74ba-4398-8679-c41edcfe7ee7',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'1899755f49150eff454a98fefc3cb7ef622a5e6f6772afa4837534761b6407f2eb76b0a0302bfdd0da9dbd409632568958a8c7e3dda55f5569a0465fffc8ef33',	'2025-10-29 12:10:31.102',	'2025-10-22 12:10:31.102554'),
('f8df1edd-ff3e-42da-8890-16ce06ba70fd',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'78ea515bc8bc97f9a54a09e6cfb1f03c8cebd5e01f416f5bad060ec7ed9128dfe7a1f7272fafa718003d4008c16549ac8a9f9fc95d3637e7347ceac684427add',	'2025-10-29 12:12:32.816',	'2025-10-22 12:12:32.816844'),
('27df0ff0-73f7-4a11-898d-bc258b411bce',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'f6c9ef93edab55e0320827558fa9532064d7e97015a08768203f24630f984ae47a8ad339ef7731e84f5213607021592151d25a9407ebd164721e2d1e594751b3',	'2025-10-29 12:13:04.694',	'2025-10-22 12:13:04.695441'),
('b05dd379-f650-4eef-9f08-c9e0eae661fe',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'06139133a5755d64df376a01ce67651380cbd202eb7b01325afe1492b00e0a20092f43c68cee038fbf10b71b460d501a58e9b52cf268f7f35d9439c118524f21',	'2025-10-29 12:13:41.336',	'2025-10-22 12:13:41.337356'),
('36027c1a-fc16-4afc-9d6e-d7935422a5df',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'b047c594f06dc6087ac285a42f5730cc4456647b91193a250b120ac5a4e5d7cdd5c1e51827212d375648d0b6298158b0ab74c1655546408fb042fe972f295dae',	'2025-10-29 12:14:02.669',	'2025-10-22 12:14:02.669737'),
('10cac50f-ebee-4a27-9009-2e911023aeb7',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'166d0e04788c461032826706e574126a05d408c0a6a48b1fe4718d4c1c05d3ff3fa7ac5e3097fd3ef084b0b04990277c0cd87d3563daa550786c37d6d32df9d2',	'2025-10-29 12:20:51.471',	'2025-10-22 12:20:51.472506'),
('41893bf7-3f6b-44a0-94bc-6d983b080331',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'dbee9fa69b89a0d1e05963c575504d058515a2545859bc328b5b7f7fd20d51f57042703fbeed9036a0b9dd402431e3f265362d028d536431da8e45f17579e88f',	'2025-10-29 12:21:25.514',	'2025-10-22 12:21:25.515842'),
('bb04ab9f-75e6-447d-874b-92e7bbe68bc8',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'4f1470f9b22764e94e369b940d180d562b311ede041ce4f46b32e6e3e61d9ba22ffb70c00b852bd1be8619a2c5b36313f047297a89a8b314dfd2e45e59e982f5',	'2025-10-29 12:25:03.843',	'2025-10-22 12:25:03.844577'),
('8822ef23-cf91-4ce3-aa65-a0abef0a7bf1',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'91760bda15d0daec833efb16d5834ef19dfc73eb856c0a8f6f213ce982eec62b0ce19755c15f30db362cd77f290db17b336e852d9674ab8b888394ebd64f5c28',	'2025-10-29 12:26:56.859',	'2025-10-22 12:26:56.861037'),
('9e1a0d46-d8dc-4a16-8c4f-b9d9e2c691c6',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'b587cb74d524b536a23767540587217281b08cd793c4117faa36d35d4960dede7759cb22c23b6c4a991cb214b6b5d6af09405c0d667a8efa842f018c41c0a56c',	'2025-10-29 12:28:42.126',	'2025-10-22 12:28:42.127295'),
('8511446e-9f5d-4dd2-8167-572b0d2f66d9',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'e10fbbf6e464d2f217c7b4524b582f640519a196809cba6e14091dd7d88d8e547fdce708d7afcebf50d85f72a84333650cb3041bee3c3c8e71e271e213759050',	'2025-10-29 12:29:08.733',	'2025-10-22 12:29:08.734184'),
('a2885542-5b2d-4644-9299-45728637b0ff',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'87eb480d3843c6f3535a4b7c15dee45ded37500c16cc88956ed4e3d06dfac27259327122f75a2996448286667dc54f775d3143d95e35b35d153b137111dc5638',	'2025-10-29 12:30:52.132',	'2025-10-22 12:30:52.133748'),
('a423687c-03fc-4c05-9664-28f17ecab2df',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'e44214709999fba6446c572345fb03c6f94520cab3276ae968ca21ca41c0215f8895ac4fe223524863dd73f7279cf04b3c0bc68e806da705b7ac5e5ada9eed4f',	'2025-10-29 12:47:21.222',	'2025-10-22 12:47:21.223205'),
('fa8e2dd7-f464-4a85-9b9a-c3e0a7ec479b',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'd75bfca42afbf67791c7de6211bb3000f00b51e792ca2a3e90e86c51086c4e63a6a7960a8a2bdf65a28bdb911f5deb403cce7cfa24eb24f9d677c926d7aaf631',	'2025-10-29 12:52:21.85',	'2025-10-22 12:52:21.851273'),
('1ace5900-405c-45e4-ba10-6d98e1b934a3',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'f21bcaf1b39be5ed8cadc3b7bef24d8ce63bd7ae6ff7344f5b100cb8c81baffc34022b2fcb1aa0dfc7716ea1158328bd5e16396e3eb03433570f8494f6615541',	'2025-10-29 12:59:57.035',	'2025-10-22 12:59:57.037049'),
('d01c10c2-fd5d-4a29-aa47-64c887d5b52c',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'd70b25c37704a013eb90392fe6d6d0aeee94cf164d53067fec7cbc20931dd5597f88221dcc631f6533f2d0a4fcbb27817c02c09ab37b58c79294f6052da51de8',	'2025-10-29 13:05:32.284',	'2025-10-22 13:05:32.284396'),
('2f33258a-e90d-4b75-9ef0-8a7bde987f05',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'5072cb2250f6a2fb0ffaebf259e1f3378fc18103f050aa7cf541c30df7d41da5f5616446222b8e770c05a7f0ad07ab3111aa4cbae3c64a08957543c4b17a046a',	'2025-10-29 13:51:10.091',	'2025-10-22 13:51:10.092524'),
('ea024128-5c34-4af9-8428-39d9376dd009',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'771f5aa98aa468b5c2369dd2996790b4910455a1abc3206afc32373722b76486437bbb47a4b3658ff68eeedbdcfe06df83187c81b2b76876ecb0ca3ff879d865',	'2025-10-29 13:51:45.858',	'2025-10-22 13:51:45.85862'),
('6af98441-e6f5-44c6-996b-8951c7d7ab9c',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'fa557f40015b2c2efb04c69cadaea769eb377ca0048f7ffe63090aadb4f9b4e60be6baa22a14743be6ba8fbc352f20cf9bda68ccbb54eec3908b3208d6b282b0',	'2025-10-29 14:43:40.293',	'2025-10-22 14:43:40.294445'),
('793ca53f-64ad-4294-be83-b01066784d48',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'2ef42655083e4eb2f7ab813beb08fe8ddc0276d74b2c83f6af1d1a55a09e8cbfcd5279d8f2ee7f3a1b137a98cc3b72f0297ab43d3e2116e121996c298b0f853c',	'2025-10-29 14:48:56.414',	'2025-10-22 14:48:56.41601'),
('1ad57320-bf0f-4b4a-9b23-331af2a3d116',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'd4ca7efbda42fdd2456647fbb4b4ad7ea2ac221f11cc6e7f9694760d3c353ecbd090d25d52671e8036b54d74e24ec5ae7d682d918bde75c72aa20744bcc7c4c1',	'2025-10-29 15:35:16.154',	'2025-10-22 15:35:16.155103'),
('9aaf9a63-21f9-4f15-b4d1-391b1ffaeefe',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'4ae637c2549e5e689f8a794e30c041dabd744eb38697ca4f5fd308940784400349012f7ca26173d811916df3c969e4d457be69430338261529109b2533fd1ef8',	'2025-10-29 15:39:40.075',	'2025-10-22 15:39:40.07716'),
('95183820-7815-48c1-9219-c5b55d91dbca',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'1c6d8d5e0002463d9e446e0fa3accc7fa0b9019500dbc738923ab529aacd70937cbcb905fe4f4ce50d90b92f2eb72841530cd5a812f22541aa08ada62414cea4',	'2025-10-29 15:47:54.273',	'2025-10-22 15:47:54.274354'),
('86e8ddd4-5cae-49b4-afa3-58f12fe52c6d',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'67d009971cf93e150e06e09bb14ac2d2537cc260dc52ed69e3487c8733d8eb2fdcfcbacdd5a10a0a13e14216a7fe4ba140c740235edb8e55534e84c26fca64a3',	'2025-10-29 15:53:08.833',	'2025-10-22 15:53:08.834979'),
('046e1a90-fc02-4d41-8478-6af6fc1a2963',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'5f47b7a5366b300a6b1551d882dfd22c2ac4986a3911b1a97145b5a023c16f6bef2b6c09528e699a14e377debb919534d2649145b223654c9d7886872b807428',	'2025-10-29 15:54:59.504',	'2025-10-22 15:54:59.505336'),
('0cc4db47-096f-4bb2-b900-369bad2fb6c8',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'8741c3ce0c7641625337e9126bb997bbdb1b290b22b79f9af233fb7f12fe70a6accbb26b33e210555061dcd5e831a76b0c5dc2d21caeabeae3ee25b38286150c',	'2025-10-29 16:29:28.561',	'2025-10-22 16:29:28.56274'),
('689bfc7c-2f3c-4c66-a6bd-02a6ec3a649d',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'b2b5e87a3e0ec6d706f581f9ff49a63c1d72f3af425a5809ef3f4a462ea8011dea8a2937ab82755e0670caf2c09daea20958e2fac15091b42ef803191c622b2e',	'2025-10-29 16:29:41.329',	'2025-10-22 16:29:41.329961'),
('be6583cc-f8ec-4efd-96fa-42c32d621abf',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'9c61fa579f4903d0a591eee61431be547670641684d259b8dfcf0c98cf660980dbe7606e1fe6026be0a1c863ef76463c19c2ef260093240e4ed04d1a38655338',	'2025-10-29 16:45:52.717',	'2025-10-22 16:45:52.719215'),
('ebe3c533-f2b8-4e8c-8c11-6e9b22577d22',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'd9f4c1644fffe24df1ea822f3ad2f83709b96c21b9d702cccfee05671ab16a6acbb113913fc956ac4cc58e24e45b195a79f787bae40edcdda45e6539213603ab',	'2025-10-29 17:05:08.015',	'2025-10-22 17:05:08.016291'),
('104f145f-c7ed-4ae5-8f49-9676387f3e01',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'd810f29da5a5d12798bc98fa8c898d690c71db49804e8a6ef4829502855b4d38e7c4f9dcdf8f73efe2d893ff931319414f981e20f48664a4a93bd0c925447686',	'2025-10-29 17:20:42.245',	'2025-10-22 17:20:42.246095'),
('0e9fb187-de72-45c7-9941-0eb978b7b0cf',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'f106ebcf39c8444b9667dcb8c96fa87483918c1b415ded022f4732e993e9c329ae0eaee50e6d88f70e504ca53d8ddb602ec45d1c2207aeaf957c85198128e0c5',	'2025-10-29 17:41:40.892',	'2025-10-22 17:41:40.893468'),
('ef511114-1aff-4abd-bf5d-0ef69b99a785',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'32b1b72e48a24480ada507e2ddfab82c36a274defd6b7800383e92c30672cd7cc363fc3306d1002260eeff2e0bea58a276ba2cc22947d9be3fee270d997d149c',	'2025-10-29 18:02:13.985',	'2025-10-22 18:02:13.986709'),
('d0033c03-9f76-4956-9795-bbf2b9557b2f',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'037040011839140806f67d319ba48080170cedb3d0405a9f52167e6bc325b55553ebc364d57d1892e23c3ed03f80c24bcd8b9d43683ecfee8e4bc8bfd3501971',	'2025-10-29 18:10:10.149',	'2025-10-22 18:10:10.149615'),
('6972262f-56d4-4b2a-9b8a-7d66fef51b78',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'822e9d3a53c0e523109592dd249307ced1e24e34294b53f9939897f35e3425d375941cbedaa453c3d8f3731e4add2b87fdbdc7295e13f1a9410ee29025ca35bf',	'2025-10-29 18:10:47.583',	'2025-10-22 18:10:47.584096'),
('7f7da494-7393-4296-a38c-32955804f686',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'64d5e41230615db0c204e8c70a8a81f7a7dbaaf2041e7288355ce22d2cba1fecfa649776412a11ea79f511c9f15923844a4760c56508bd1df0d09aed6520d086',	'2025-10-29 18:11:04.183',	'2025-10-22 18:11:04.184049'),
('91b089b4-fd16-4bb2-89d7-56ad430e2741',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'8cd8c746ccd1befa70bb9e75e761d79ad1e924db96667edfa0fa920fa07132d03c50a1316f854e4661b7229435a329667cc665adb09d0d6898b7c7badd488c68',	'2025-10-29 18:11:46.964',	'2025-10-22 18:11:46.964667'),
('e5681ef2-bc53-4b99-9222-ab5f26fc7100',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'9f043f79c924a40c4885a3ab3182c2b4fc48d5fc203b70d8e9ddaa5fbe8fe04041b00cac01318d09bc7962ad54c557ead7d0171b05f24195794ba07f6e0ffbf6',	'2025-10-30 20:01:39.333',	'2025-10-23 20:01:39.334255'),
('42348199-acb2-4c2d-a98f-6dcd583879cf',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'9d8affbfb78d7ad1b104f4a3cf4fb59db3be372a6004a67cf7861f6aeb5a55fcbcceb762cbc2dd81139ba08cb7013346df11e129299acd128f171df64978e57f',	'2025-10-30 20:15:07.01',	'2025-10-23 20:15:07.012233'),
('2eb3ed0c-c31d-4fc7-9a9b-9b898c8027c9',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'ced8c34278046ef87b8107d6a0e86875f26bcb9aa2a54b69f0fbc3469b9d26be18369d639b29148af564f65511b859ad7346b238a0c3ad15cc9409a15ca30ccf',	'2025-10-30 20:33:44.571',	'2025-10-23 20:33:44.571932'),
('28128ee6-3941-45ca-a3bc-9b73e8869253',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'3b05fd85233dd1b63099ea8411ea1f6e4d9567fa597227b98b341171bc3642cfbb56b652b10a56064fffb2cb267d76caa398a5b17e85a0abdb71783214a51394',	'2025-10-30 20:38:30.452',	'2025-10-23 20:38:30.453345'),
('c7c62a0a-85f2-4667-a495-2e7797a755f2',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'387546e7c0d69869531f59b499491004a0977f53e8ae5bcb8f77403d903045a1764cf9d14e3969bfd0fde7bc96f4154e0962ff662626e02db02ddb6ec7e0175a',	'2025-10-30 20:38:58.681',	'2025-10-23 20:38:58.682597'),
('b688d7a2-a539-4cbd-83c5-8313a023c713',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'b7b8cdd4e32aee5ebe715a2a53ff1a5493a3f62aa382b1a1227bcb4b93d51d8a13b00c281c4ad99c386b76a1f58fbd43c54ace7ee9a03344ae4c4caa2071cd23',	'2025-10-30 20:57:33.899',	'2025-10-23 20:57:33.901364'),
('ce5c4a9f-73bc-45b8-ad49-36265d6bb089',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'71767be23be829ca268d28bcdecb2a5a414828d2792301389d2f7d494a5d54356e9b52537e5a2a71e8e550ddf8473fe5a28e3d517a36ee03bc1eb4f6c5bae43f',	'2025-10-30 20:58:05.433',	'2025-10-23 20:58:05.435971'),
('76ac3314-326d-41e1-92d9-37166a6b7d3b',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'b47c4728625d2e3adaf6c3bb3db199b96afe5a61a27f1faefbacde8718976f1176fa8d9446669eda8d9e101c5084e3b3b468f709ad57dbee3e2ced77421acb1a',	'2025-10-30 21:02:57.991',	'2025-10-23 21:02:57.994798'),
('5213a7de-5969-419e-9c0e-270de0804fd7',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'614fb91f630d19e78ba50d78a2fffb76c4b6eeeda20e7ca52fda643cc22ad9c16e5dea3c617e50f5c010fb90a411db296d94e07421cdcc0ccc8bd63fec2dc2dd',	'2025-10-30 21:03:16.596',	'2025-10-23 21:03:16.600851'),
('7e48dabb-7e4f-4961-b14b-d636f5bc742c',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'b78c7b5586e4230742ea31da1806ec0de7996bd980c4452ffcfb0a206c46b056cddabdd14e204edbbf3ae92cc8c6dec1ca81559c4ae23103bcc3fc1dca45b547',	'2025-10-30 21:18:58.557',	'2025-10-23 21:18:58.558478'),
('43aeaa8a-9274-4b31-95fd-932ca3e0e2bd',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'71ee94d0b4885ef4f5fe0955a3f2676b79a64fecdad9510d1b2823c058d7f1f79e343d1f816b370f1b8738bacf785b8da31ce79a76f56856358abc3270164362',	'2025-10-30 21:19:53.611',	'2025-10-23 21:19:53.61249'),
('8eab1179-7b6b-4754-8784-89a503c3fe0c',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'0166bf9a17bdceeef1735f445a190e895bb478ba828019b02c8c4905e0352fbc495f92816afe8ffec1a6b58b3108ac65484b80b98bfb1c4e8f7d98906d9394f6',	'2025-10-30 21:36:47.265',	'2025-10-23 21:36:47.265715'),
('ef190e24-2fc0-4315-ab04-c85a78867067',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'6ce3a9675df653ab0629d279ed6a3a0e44a8c482dcb63bf62210582ef8e34e92ba55a29609a7de32071fe92be21a463df55e023310973cdd5b446da2e93d7604',	'2025-10-30 21:39:00.205',	'2025-10-23 21:39:00.206679'),
('e304c71e-a844-4c2a-bede-62e2aa053920',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'f932ec6eb818b5850d08abda5098dc57fe6049f247d302a8c65e7045c73f8b1e90e8ad8b7dae09b3f6bb196969f80bf1c2813e9e9a22e13d03753176644285ed',	'2025-10-30 21:41:23.851',	'2025-10-23 21:41:23.851641'),
('d297998b-9d34-4ad7-9165-5d291686a43c',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'4cd5ad5b300707a743ecaa30fc6ceac538a138c72cdcbfab181500653432810a40dda03fda367b7558ea8582355be7ebfe3d2022c9593c43630f11381274b43e',	'2025-10-30 21:44:21.837',	'2025-10-23 21:44:21.838419'),
('e0691142-6c0c-4771-99bd-43ea65d06732',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'9fa73a2977baee3b7029646baceda3268821ddd1d1f662d37b454f6eb327f9f667e58ea8a5589e4b0f48039541e02c8bd5a5f7fa36ec16d02ba6f3aa65993850',	'2025-10-30 21:44:41.244',	'2025-10-23 21:44:41.245158'),
('1016c06f-54fd-45e3-ab16-b00512c5b047',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'42268f78f1a87186b9c1d2138c1268feff6d140b94f28e72b9bee0ea9515c8804868d9ae0f39371e6dce7719bfe219ddcc56f045ddde7c0adcda861f920ace93',	'2025-10-30 21:51:10.785',	'2025-10-23 21:51:10.786445'),
('6fd7c0cc-b572-4ed6-9d13-005d679ef6df',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'd8d6ac7d829c52c6af6619a1ccff10926902bb8f15b5708a3e467e2afcb6ab1159bff78527f875fc8ba354af78741c58366266f247c36baae97280a25a51b9ce',	'2025-10-30 22:06:21.63',	'2025-10-23 22:06:21.632213'),
('8c9d01d1-1201-4ea0-a656-3686b3e3f6d8',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'8283759ba902369db11a1d89d70b453bcd108443c02eec8c9ab2916a68bab035a435ed0b8e1f3c1ac6c9ea8229a9d280944133b6351690ad1424bf22913b5f2e',	'2025-10-30 22:19:48.799',	'2025-10-23 22:19:48.800167'),
('628aaeff-d551-4887-8bd9-c37747a8adbb',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'a61d0e386a87055acaa2110617a03f2f5d950c42b7861dbf6d2de4843e8d4d4a2c2e46ceb28ad3bcb5511af62826d255d4736cdbedfac03e1eaa720131cf91d8',	'2025-10-30 22:35:02.241',	'2025-10-23 22:35:02.242599'),
('b3bcca93-869f-443d-a447-ed8d66b55faf',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'6f41510778b9dadcc6951d38955bb5b67dc646cc295c92156af14c10961691d857e06d692f5447b2a6ce62eaf3e2107f19f28da41b9761f33d1861e0e73ff218',	'2025-10-30 22:50:42.477',	'2025-10-23 22:50:42.477591'),
('3e6bab41-0368-47a0-b63b-d0c2482b768d',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'd7e3f41aff397a4a50a1565b31b55767bcbf95239a454533f2813007f4072799c8a13c5c55ec2f5aaf182ecc775a651e327cc70fe7577535c20c395ac4cf2281',	'2025-10-30 22:54:12.816',	'2025-10-23 22:54:12.817807'),
('aa9cf4a4-d9ca-4fc3-8fa7-297fa957c126',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'17858d2232014b725d0f73063d65d61f12499b2681412fd2c200119fc09cdb15220b5e053bb7f16ab3a357b8a8b69fd44042f83b1d8767ad38a8870e0e669d6b',	'2025-10-30 23:06:51.394',	'2025-10-23 23:06:51.394694'),
('0928cead-391c-424e-85b6-d5a391cc46e4',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'76c4acec1fe3a230dd888176e87a74eda1a8f6b3d032234c33187f28c2c57ad5faefce3385a075d8ff076784822eb6e7c7e32fe80561aa6d1c690000812b851c',	'2025-10-30 23:18:34.175',	'2025-10-23 23:18:34.175712'),
('cd812f56-b338-476e-a805-37776bd454b2',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'26232f10c20c34fd9ba00becbfcd1d1762e29ade18dc64129d44a593d8e3e417a00ec0a3792e77400a38771caa637c7d58a8ca60d233a9c45c3767c7a2879b30',	'2025-10-31 19:04:26.414',	'2025-10-24 19:04:26.415934'),
('72c2c848-600d-45e9-8b5f-289687a5ffd3',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'3e2d5d3ecbcaa22ddc54eae28d56038ddcca8f644a8414ae716f86147beb9cd2f90ec8360ec5b73986d6bec4e97f9b31a8d207cd291bb78d410642a9d118d532',	'2025-10-31 19:12:14.347',	'2025-10-24 19:12:14.348521'),
('f0846c46-6ca5-49f1-bbee-d7454c607830',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'aa84f09c473ce72a7cae8c5c14b203bde304503b5dd8cecb72a9dd592ba4d946788954ff0ce956091246f7d69537430b8b2ee00eb24500268873541764ed9636',	'2025-10-31 19:25:23.463',	'2025-10-24 19:25:23.464133'),
('d8a2a646-984e-42ac-9d06-7827880fe292',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'02966b756ba310365e81afeb86d8ab346cb65466b49112119bd9c3a14a3c0d35980658b3309b4a8d804c55258c71cae8b6890f9ce15ea11f04ac44de2ff066e5',	'2025-10-31 19:30:26.514',	'2025-10-24 19:30:26.518565'),
('5e4a547e-c1b3-4fd6-8de0-f3251f0702a8',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'0d6f51195a0a8d0fdc215f5283e51dc325641885292daf65371c5cdd5b5fcee0b851979947cd809c6629f512662c9e732e3c21b42e83aaf73bb2695664a3d8a9',	'2025-10-31 19:33:09.187',	'2025-10-24 19:33:09.189064'),
('0d5a7c02-5f43-4008-9634-fa7d77c06840',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'250d6c2d5ed2f90adf5ccba972f4d01f54c9a2951f492a69179226692bc6fc218278cbec5b2f9c48f6ea82c57eb8b5bf3ed134ac7ad5f3eae20fb3f4072b9f52',	'2025-10-31 19:34:06.745',	'2025-10-24 19:34:06.747264'),
('3b2f78e8-7cec-4ba0-8746-002628c877e6',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'31c4abb772f09f211d4e07a6527f80dd6351f502bb4807fde605cbb79bdc4dfdfe4c769949f80c03a00b4d3638066a2f1ccf31752120a09780d1235433fc1265',	'2025-10-31 19:40:51.022',	'2025-10-24 19:40:51.023279'),
('795fe586-d3c1-4ef9-8e79-5b7bb6f03a9e',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'2a8b581a3f62d0f22dabfba77c534e1709db6727dad5e587a8dbf1fc5e34b3594837839d5cd4fa694966268619d4611264d632faa8b980ca470da57aa8c93620',	'2025-10-31 20:00:31.994',	'2025-10-24 20:00:31.995862'),
('27c9d7c8-9543-4df5-9ec2-f9aff917f863',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'258861fe4916cdb61cfa2e1fca479ab986f2ca809db07ca46120a371a3e4c120bd8d0e12e6c477dbb52d834eae7d4c726970ade7438573724c34fb9732b86ca6',	'2025-10-31 20:18:48.408',	'2025-10-24 20:18:48.410565'),
('6c023e75-4059-47e6-abe3-c30bb1dcfe8f',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'e390ab9571a7aeb164f0019f4091752d0e00091ccb52f94531f7fd6b3c827c525583b78a1971203d5ea82d0af3b7abea52777a4c54e90529b77e64593648d5c3',	'2025-10-31 20:25:43.171',	'2025-10-24 20:25:43.173169'),
('be4a9957-f5e5-440d-82b4-41cb056a4417',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'49ed1e5f1e83069883e4b3c061bfb20df694bac814d402191af433ec8fca3874005a2a0891040f01c008b9edf1dc3775c9744d43b06281939d6a6cf1d669f849',	'2025-10-31 20:32:13.733',	'2025-10-24 20:32:13.734866'),
('8f99db12-1477-40c0-83a4-2eb30759c25a',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'444f2239a7876e9e508f39117935e26f2b1216070a31db93a80068de44847ef54a7b96300d3df156518b145ed03166ae6cd8f55d3dbf86374f46d93f4bafbda2',	'2025-10-31 20:33:39.817',	'2025-10-24 20:33:39.817463'),
('6a78f175-3b52-4d7d-a7b2-cec0a1cbb7c5',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'0d600b3c273bfa63b57e8757b935360aa3c24f9c2d673dd7408cdc83b7e09514628c2b21ef9d8fa7208cc95fecbbc7177b9554e287775a7ca26858dc174bf5fc',	'2025-10-31 20:34:16.884',	'2025-10-24 20:34:16.885414'),
('9afcb54d-abb5-42b4-85c1-075a5a74054f',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'7eb872c200ae4d20bca133ba9ef5e2d3e953845bb793c1f2ffa3dc6c2b3b95ddf18baf49a6d379fe36c3fbc473de4a89b5d0bd1e57f3ae72a037430fb50e4601',	'2025-10-31 20:44:39.174',	'2025-10-24 20:44:39.175498'),
('2573bfee-3313-49dc-8135-cf3c01d490f7',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'ff7a2dc6d4ee24bb539dd6369e0598cf6d77716cfc0edb892f8c9f9f5cec413132e097da54b47cc2ffe32dc22e45878191d88288f530b70dd2489cbbf17d4d5f',	'2025-10-31 20:57:45.197',	'2025-10-24 20:57:45.19861'),
('428af98a-36cc-41cf-a2a2-413241fd4d46',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'84e0454d9ee94376ecd953f66e0b1d49c0fade590ddede4e8168c3e5729c0b7c555c468e6ee98932d51a54cdcc2e964e0c4e8b7c0a0e0a0f172829eeb205ae99',	'2025-10-31 21:18:01.233',	'2025-10-24 21:18:01.234229'),
('d469bcc2-8ec8-4d32-bf3a-31996c871b40',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'a251aecb7ae62148ccae9544ba590c8d18dc561f2cf5ea4c1869c652fd7d8f946e383ef8a4e481112369c6db2393d15e483de2fd539d795b520a55cacce59edb',	'2025-10-31 21:47:09.064',	'2025-10-24 21:47:09.065968'),
('de7c5370-a1c8-4e6e-83c9-3ec102f4b9b1',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'9912fbf3d1bca7397a8eea938839c6d7ffe08e098e49240e64216034a07f8361f8a474523d7d33b81c762d456271ae4fdc665bafcd9752835ea1e412b91f0de5',	'2025-10-31 22:03:26.629',	'2025-10-24 22:03:26.631452'),
('24789046-7616-4e5b-9657-32b44bbc6958',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'f319c5983a807bd582f22db4621674f949d1af5dd20d5afdb950470d84e53a53787b385e16943aee6be605f32d854940a88a5005c61a5808087d12ac1fa8fda3',	'2025-10-31 22:03:57.057',	'2025-10-24 22:03:57.059315'),
('8f3af069-0c78-41be-8de2-5445f4e3f5e8',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'f7291c79e058d790cdc752c9fae5c76eb927a3eb042c02b8179657c59611993b23e160dff8174ee1ed2203ee1f34c8a4012e9a47b25c44c2dfd2763963dccef9',	'2025-10-31 22:08:14.054',	'2025-10-24 22:08:14.055074'),
('eaee2d12-9edd-4e64-a78a-fb22a556ffdb',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'ebc2c00b494ab95758fb6069f40491d02a91bccf5e9653ff983cfd63c916982ff730ae792997184e8d93300cd58c7855b3dc6e4ab2ba467c7ad2e42647e70ec3',	'2025-10-31 22:49:39.773',	'2025-10-24 22:49:39.777056'),
('84387847-b22b-44a5-8706-f97e52e1816a',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'158d115b2ef87e18c82fc99880aeed0ef3666c953d2c83c0c1203c25b6a65d88cda4a169fcfe30cf766f7bd1a40500f24d384ee0c14e8ebe8da403a48b8995dc',	'2025-10-31 23:30:03.521',	'2025-10-24 23:30:03.522932'),
('4052ea0e-aabb-4d24-b48e-458c77dc611e',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'441d3b20fd3db0655571089e25a9b1779d767ee72e93deeb650e5fde24050f3891d2df45039ca419961cfec5f090c5ae8bbe3a8e9d587de01a3ec901f76bf7e3',	'2025-10-31 23:33:38.084',	'2025-10-24 23:33:38.086363'),
('7610cd15-01a0-4af7-9369-ab5b87388656',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'442ba00d6ee01ae46584eead2ebb18a24bfc64dc3c0a5a74bea9b30fc4cd1f25320a0336be7ce4837a29a528571007a9009bb247da1edead66257f62229b1242',	'2025-10-31 23:35:18.412',	'2025-10-24 23:35:18.412873'),
('fe9d53e6-a12c-4fcc-8476-4b61ea179c17',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'13c257c5131e708c69419cb7d4358d19b09817ff918f842973459419988ca2f81307dbcb6aee1f4ce3f0689f60e679d25c420316593248448a284bf2b5e2df4e',	'2025-10-31 23:36:20.517',	'2025-10-24 23:36:20.518837'),
('20f15049-72f9-4b4e-b903-8842c9d86b4e',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'f71fb9574d04a73b31bf5c6647394949227f0865a8a2c0af5bc7f2f676698bbf0ae0d447b5092044c46b014587dcdf68fed087667526087b9b6bb4207b68540e',	'2025-10-31 23:37:20.726',	'2025-10-24 23:37:20.729931'),
('fb6618e1-3284-4ef7-b4f1-76813afa6a62',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'1e8f587d7732f4e46a1be756d6686b91f59f9c04c16a62cb5c51c5ec61e2e4cf52e50bb5063bd6fff6403b849318907170fe4d4388a0b71948f3bb84de2510a4',	'2025-10-31 23:37:41.074',	'2025-10-24 23:37:41.078001'),
('4c936153-de54-43ed-8fc0-1704cc5ead29',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'8cf9ad0423451a08d95ca197752e353a6da15a272dd0a463c85c4eba719a722aa231c1b0031ca4ea964aa4208921f29e1049ea77cf143ebfa3c4a435ff188c9c',	'2025-10-31 23:38:02.066',	'2025-10-24 23:38:02.069343'),
('4a08f224-5ed5-4113-8e2f-03bba41585d1',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'29755bf38b4cfa598bccf48a99450cf85d1a61199c188d097232ddf85efcefa62d3b94d1d4d976634414b8806a25d05aef9bef12cf7585258b2729e89b771844',	'2025-10-31 23:44:33.337',	'2025-10-24 23:44:33.338074'),
('0dcaec97-7d6e-48bf-a389-226a97946797',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'c62b817a4da21f87026a3492b41d5dfbc2dce226aa44ffaf1e26e17a6c69fb668948593cda15e0227bca07a956303a32eb1086c04a035f4980a1977db262951c',	'2025-10-31 23:46:07.375',	'2025-10-24 23:46:07.376533'),
('c7fbeba3-6a5d-4224-b581-15126592d166',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'17c18a1ce501c6506b87a2d9923290aabbf713f349e6f8b372a5b67f7857e548d88bcb7cdd52fdf229f3888ac380524e01be3d7c99970f2189c838d402841ec9',	'2025-10-31 23:48:13.561',	'2025-10-24 23:48:13.562466'),
('99860e78-c804-41ad-978f-2a0b1aa626f8',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'4da2ae84ab796de4189c079c85577382431093818d78a16ed260c97d6b19e8ccfc5f0cc1923e93980eb58a277190fbdaa7aa41a8131f9befdb9d2e9e836db32d',	'2025-10-31 23:52:49.231',	'2025-10-24 23:52:49.232789'),
('071d9fae-f68a-4529-9e1f-5cba56147f68',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'6e022a24e9789691c36f789c9b43b8114978b70efbbd0890d8e745b6acb4831249012106a4a675f55ad98e34e38261719bcc5e801fdf9130afb34c652308bb3c',	'2025-10-31 23:54:19.445',	'2025-10-24 23:54:19.446018'),
('9e5a851e-e863-4e1c-97f1-3a8ab8546e9b',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'b40c1a800414eea7011a8a02ddc94b0602494bbfc7534a5a516c970a932042f5a4b93d58287a4859d6ff0df28e1c51f4600965fbe7bd04d5a8e1dfd98fec10e9',	'2025-10-31 23:55:55.4',	'2025-10-24 23:55:55.400605'),
('40ce94a9-cfaa-44ee-9d27-a9c869390fe1',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'64c57bb3855427bc5fcb6cafaf547aa6a84aff940bd896944817f4914b717f25072e8514c2f9f9858cdb1a6a786be2fdc7cd039e57c7f59a1c93b7f638e95869',	'2025-10-31 23:57:28.37',	'2025-10-24 23:57:28.375535'),
('8e6c43fb-4a64-46de-8246-330630019793',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'a22b82323afa3d44226df0b0be42b712b1d3241a42146eb725ff72e2975ea50e3a23f970ee5adbab73e2d9f07c8c673124aa21a49d3775bbf450dfbafc97e929',	'2025-10-31 23:59:53.68',	'2025-10-24 23:59:53.681293'),
('1bb1ff71-d001-46fa-a0d6-dc5a11452269',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'bebceafe07946f7ef3dfd1e86106b3c1cc432fa3c7f2e930f304c88b8fc8046d4dc4e98d033ca9deb17e5b4fa5f50cae97e4b13548d588d87fab0824ef302c8b',	'2025-11-01 00:03:27.422',	'2025-10-25 00:03:27.423718'),
('9a729c9e-ac41-48ef-bd15-a3500ccea919',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'00fb71fb5b619786ce5aaafa87e42328e83ec66845b699d7a21c4a1b4b6d7c40fbff7b9195bdcb8f3464f5f9fc2159396e3ad1b9800af78fa8e0418f06ec9bd7',	'2025-11-01 00:04:53.576',	'2025-10-25 00:04:53.577622'),
('139dbdcf-3ae8-4799-853a-a4e6041a4667',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'50b2116b4033c75fec9f40ee998562e41b10b8a530cc9dc2a74c9869f9261922dba720ede6718c4f7b3aef1dedcb929e91b796580b00a036af2db3f8b5712ab4',	'2025-11-01 00:08:36.109',	'2025-10-25 00:08:36.110611'),
('e302af26-f5c1-4fa5-95c5-7dac9af122bc',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'576d6cf4b2119d770c36bd4357ac66be0c97971bc569960eff613f36ac8b9967bca6d3e4234695ae65af68e08a6685cbfe1093a8c0afe1cb57035f10c648665d',	'2025-11-01 00:11:41.033',	'2025-10-25 00:11:41.034913'),
('d913f442-b14c-4706-84b4-fa2c2f9d6642',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'31869df5a6317765108d1f6c7433ad2f492929130c21419c9ecadd701eda6a043a8d5eec6c07f187517dad42dda57764f46da56a162038f2c752b12d691d26d5',	'2025-11-01 00:13:58.394',	'2025-10-25 00:13:58.394439'),
('7d1dec9b-d77b-4f85-ac8c-be44f0ebf698',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'd6e7bf83d1008e19b79b143381de1cd5826c21a214cb891209fef750985f5fcfdd84b56d5e0efa65124f56d7496f97f1556b46e7734d7a1a573039df8827bda6',	'2025-11-01 00:16:14.529',	'2025-10-25 00:16:14.53113'),
('9ab6d1c2-dc87-4067-b9f3-865a0250d455',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'0eba25ee1f4c92cca25df3f9537f0668fed8b1932186565c184b1807115fd2fdedf65b2adfa34abee9e89327f1d2fbf86c72116e535795f9d563876d21f7d2b4',	'2025-11-01 00:20:09.439',	'2025-10-25 00:20:09.440741'),
('8c79c3fd-ea88-4de9-903b-cd82f6122a50',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'6393342fcad7ba300e54d28d7896320591b7fccfd87d3fd7593a6de22ce9e3cc61f6a44fc2e54f802f00ccc2f17dbf4a0a9ad818c667f5959576270ca6551842',	'2025-11-01 09:47:23.583',	'2025-10-25 09:47:23.584982'),
('892b170f-1451-4bce-be89-bd3f4b4831e6',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'b0c3196675e601ef2a4ad5854485c849ded729d5cb0ec6b289c698b810aef10ee4666f9b9fd24a8550474057b9bbdd13bdd05932b6a408b40bb2120a4e3ee59b',	'2025-11-01 10:10:00.527',	'2025-10-25 10:10:00.528887'),
('98efe507-255a-4e89-8cba-97b1e2c4d7e6',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'0352683f9990aa711df96d66129007025fbdaa5321e901979af76e7674d381455cc4cc829b943c25a7aac21f909d2497937663b442cbc6af953e7f0d6d02acb0',	'2025-11-01 10:16:00.143',	'2025-10-25 10:16:00.144177'),
('bf3963d4-4244-4acd-a0f0-1f1394c3391e',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'7d58b8b3c87c8139a9e7bccf6709f7e0fde82b3f11aabd0e30cb0e622895e0d7ce4b7ec447d46c346589aa8fd771e28adc04518e878a128f4d37e9ea204e9085',	'2025-11-01 10:39:02.705',	'2025-10-25 10:39:02.70609'),
('9ece5d81-3e4b-4702-a6df-ec1aaeb1d6f4',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'484095b80ec731d52a29f33e1e5efbcdef4ab558c04a62e7181bacd5b291757a9ccd7c94cd2a2fd81abc6288b38d605f9f2ef7bde83359235654075b279ff757',	'2025-11-01 11:25:57.599',	'2025-10-25 11:25:57.601129'),
('ea0fe856-85a4-406a-9e6b-e72c32aaf8c2',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'dd9610e82882466bbf16345ef6d81777ec10c52e15b3d8629dbe4b8d810940387d28f9949014bbbcc288dbf05dde838ce9d1426367778a60ae98bee851256528',	'2025-11-01 11:29:43.027',	'2025-10-25 11:29:43.028623'),
('b00c4a46-c6b8-488c-91cd-8dd0b2346cba',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'f951497185f62df43e751207726cdb514326a4adbe85308ea7254eb8d8beb254e507d4ff9b3ae04c79f28924c19735dd1bb4dd1c46a16dc516b48102e2ccdaf8',	'2025-11-01 11:46:10.923',	'2025-10-25 11:46:10.924433'),
('f9e4dedc-f543-430a-918a-1791a4d72725',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'1f0393877a96afc52b84f3aca8785de3d926ee3ea2ea33ee3c80d4d3d15a5155561a9e3b297725f6902ceee273475dca81b3e65d7b702d75d898ed06a1cfbd81',	'2025-11-01 11:49:49.993',	'2025-10-25 11:49:49.993695'),
('d5030245-02e3-4ac5-8500-925155075c1b',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'f724e25714f90660bfb00bf1f2b67bd0d207f5352a52b38cdb0cea4403b55a633e5d6d1b08e15d78d42a60943b816b9e917110bfd29679157145365074d9bfc6',	'2025-11-01 12:01:02.592',	'2025-10-25 12:01:02.593581'),
('11bacf74-78d5-43e9-a7a4-a65902d86037',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'd622558c56a040f06718b2d930bebda96883dafb87a8d86b0131562327db995d8a1890979ec749d631c3791592c63f117ecb429a21074bba91f4cfef776bae38',	'2025-11-01 12:18:02.251',	'2025-10-25 12:18:02.251496'),
('ad1ad097-4ed0-47d8-95ba-3ed10e5203f7',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'816add3b494a6afb07e94a2e949c70b32c585cf22d6051e5eec02a68e100eb04cbd85714a6c207b5bd041709657ee0f6b1b6be587a72f15f748f022b3262803d',	'2025-11-01 12:25:19.449',	'2025-10-25 12:25:19.449973'),
('c9f56258-5879-45c3-9ffc-b45ebc92c767',	'e7ae5e71-419a-440f-8b60-3b72058b055e',	'30214a78732632d567562b8ba358451d011509e7c4e1067d3df4eaded476d63e0e9438a346e1ab94f53434c83f167fd0053cec0bab66c42cd36c3ce1e39f0a8b',	'2025-11-01 12:26:19.561',	'2025-10-25 12:26:19.561917'),
('e7bf195f-8ece-4c45-8a07-f9c8e0470b2c',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'28a36aea756bbd68b862a8f65f122b2d6ac0880732fcbdd9f34ba4350f03ebeda0d86f41bfc4dd7b03b902c59db4960257be2729cacec453d961de15e4ab6ecd',	'2025-11-01 12:28:46.743',	'2025-10-25 12:28:46.744395'),
('79d57007-8f94-4feb-b43c-039302c21c0c',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'bfbde6b70a7cc4caecbfc32bced9f92b642d27f57e6bc9732ab2dcc230e796045cfbc5181c6735e9f0346b70cb0ea15c5e7ba38525f522633156333c31731fd6',	'2025-11-01 13:56:40.569',	'2025-10-25 13:56:40.570878'),
('4876ca68-a364-4290-84b8-fc352a4321f2',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'5c4d8d3b4b706d8fa15f7c4cd691ee4202bd201625b746ebc49058b8207b950d6cb30a6957f7e423fb1507931a07c0ee5b89c4fdd7ec0edfa27490ad98d47547',	'2025-11-01 19:30:12.76',	'2025-10-25 19:30:12.763469'),
('8ebfc642-385f-4b35-9b2c-54221a1c7d8e',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'43c14779344e51d2fefc594ad5a89d7e1b9858396386718f8eca6a1f38e606980d8b97283557df9ff8f337c815bbd99935c1cdb19f4cc3dff597aaff7e2c4275',	'2025-11-01 19:32:52.479',	'2025-10-25 19:32:52.48202'),
('bffe16c7-bf85-4f14-99c8-4f3a85075121',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'4fdb80251a05f3549ea09d1bb57587489ba1c2e449a41542843d08496eb0f636599d949eb26aeb12c93112693bced38871d330cb724645c4f48118b7257bfe61',	'2025-11-01 19:33:39.763',	'2025-10-25 19:33:39.766033'),
('e2c41ce7-e59c-46a1-b893-b97f73840bbc',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'43a16b55ce7d9d16707e80bc3e92a04c85bb9cde5d98cbd68e76780a3c95646d3fb2cc88c71f0c85998cf0e79536fdec65aed351245a7da7611e7c36bdb6231a',	'2025-11-01 19:34:34.992',	'2025-10-25 19:34:34.994352'),
('50d976bb-689f-446d-924a-7be4efab2a43',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'618ee71bc57ae499ab1bd0c2ad186a230d3f42b8aa8b5225f6fd91c8a8185eb71dbfb1f33310cd87eaf7e0d1022aaacc8cd220424829e338a85345e3e8886d1d',	'2025-11-01 19:35:01.402',	'2025-10-25 19:35:01.404152'),
('710c6f9a-e48a-4720-bbe6-1b7201d377df',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'd438187569877f5d1cdba8d5a8158f65f77e94f11040dc18cddde491452553c22209889b136d60611faffd2465e588828ced5d0cecdeba8dab1d755b4faf6778',	'2025-11-01 19:35:15.546',	'2025-10-25 19:35:15.547994'),
('30e5e1df-4ea9-4520-b0c7-7f51d610b54e',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'fcb1e108ca162d16cf16e0fff91f89ff9ce0aaabd4959b3c74a5dd88f94c39cadb24084658967f87eb92a30d91cd8563a28f7f04021272fa1fbcbab58b7a0761',	'2025-11-01 19:36:11.438',	'2025-10-25 19:36:11.439779'),
('cbe3c986-aeba-4794-aece-4bf8c3eef16c',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'b8230dad31b5410eb70bfdbe29b331b66e5b586119767a4abbd5c8309ede3c9541a848f050cf6de7f61f8b4ff2529693652b470555b4cf06be4a533e539d6068',	'2025-11-01 19:37:47.562',	'2025-10-25 19:37:47.563151'),
('20e18aff-1a9b-437e-b4f8-2700e36aaf98',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'f32f224d0e86d92b5a1802a5bfa4df8cdd776aef42c6509815cac416c19c8ff792a48fbc0f1f6232c49d2be0678fc1d7701d026dad4c3c230eeaa0567b89e02f',	'2025-11-01 19:38:02.117',	'2025-10-25 19:38:02.117886'),
('2a199803-293f-4e05-a4ba-71d46006563e',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'6b71f382d79b27bf9b53478783b760e67bdcf3b78108d3a48973ef6f9615bba387bb3e0a4e545978d6fdc46f1920bfe953746e3b4fdf7625133a151226699f99',	'2025-11-01 19:39:05.89',	'2025-10-25 19:39:05.89141'),
('adaa3deb-597d-4208-a615-de8b118c228f',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'e3ee8a822652974f45cef11e9ad4861255ba8dbfd6b9649b8db48a0eb25ccfaba46ffb0c80fa83b88c088b8e12fed5108620de677a197dd18cc63ae9055b34df',	'2025-11-01 19:40:27.227',	'2025-10-25 19:40:27.228316'),
('17e60977-bfb9-4529-ac52-329e22b839d8',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'9ef11fed528d4e66e6d0f3cf51e45ec0420e7fd88f88cd7adb33220c304b3c4c23d96972f714c8804dca7dc07e9ad7637cf26b8d838e5a1b08fe322bb81363a9',	'2025-11-01 19:41:08.174',	'2025-10-25 19:41:08.175015'),
('f52b5c24-8d76-4839-b98b-2919a2a6279e',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'03aeec80663c4e5b73ddd169d59fca17c5ccfe1da578ac3abbb979207a9cde768cc7e70ef3c8f3017286d648c19358606c4a8f5a3367adb8894afbfce513d2af',	'2025-11-01 19:41:32.371',	'2025-10-25 19:41:32.372762'),
('09364d81-c750-4f9e-9737-b075e1adc93f',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'6a5a6c23274512a02c90688270c910a3e8f81ce4d78de17ebc83faf7c1d140d37dd6465ecfc8a06c4ae89016e90664de38d52009598632191acde3bf621903e6',	'2025-11-01 19:42:06.78',	'2025-10-25 19:42:06.781617'),
('d9916e50-5ec9-4f0d-9e66-a054e0cfb720',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'15a797d2736aeba5401a11ad8539342767418e090cd4432c511cbe29effda4037de8a63de7676a711200d4a17d5d67874b3a586ddb0e38d1fde4b91a3cb1b023',	'2025-11-01 19:46:16.816',	'2025-10-25 19:46:16.8206'),
('e956386c-0b0a-4684-ab85-f2ec4b84601b',	'933e4932-9877-4d09-bd8c-e17fd564c262',	'c43b80b9f1b7ab2bcad354cc84df911ddaa384f91da2a5af4997f0334361cc54b6f7eba3c05a594470e46f68735e4521b4544b162e5077713d6d3865fdb32dfe',	'2025-11-01 19:50:28.193',	'2025-10-25 19:50:28.194322'),
('c1b14ddd-5352-40a3-8bf2-d4d002fc4881',	'933e4932-9877-4d09-bd8c-e17fd564c262',	'2bdc1fc0b6711ba5cc0f082b098f6e67896283879e3698e47444a0ba5a1e008f0132d7f3ed519dee6dede62c5fadafd5a970c7af305d500e2e177d53c30bf709',	'2025-11-01 20:01:22.747',	'2025-10-25 20:01:22.747806'),
('45c8e532-8015-4c29-b0e8-561b7df141f2',	'e98a7d82-70b6-4045-b912-f3a872412e94',	'9d122aec90955241ea6c3d660c32e4a08e1eeb264d9456cb33537f03cb252464ab6dcd6a62fc52e3c2074890ca227ea23aa70f3d92e1e61e7b8742e7d4535b63',	'2025-11-01 20:30:32.244',	'2025-10-25 20:30:32.245394'),
('dd76608a-75d4-4d83-9ed5-87be3c1b7765',	'1c5c729c-5318-4ce1-90ae-8167c05f1956',	'e1afaeb21ed29aefabd9586b1adb54d1c65744b587ea81a9281198735c9c57b7860afe814efc63e89dc65a5c408219106dc78269f4655858e9373bbf96bd28df',	'2025-11-01 20:34:50.08',	'2025-10-25 20:34:50.081169'),
('0b56ad8c-2af7-4827-8f8b-0ada5a1b9163',	'e98a7d82-70b6-4045-b912-f3a872412e94',	'15fe9bc6bfc20164e74c74bc1560c795e2936f6e660926cea50e6c4d30155d539c16bce6689ddc0a97a9284abb6842b4994b1850920d3e59554dd9bab8070782',	'2025-11-01 21:37:44.419',	'2025-10-25 21:37:44.42113'),
('a00034e1-446c-497c-8237-aec9984d8bb8',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'8d591e4ccda2a2e60e7dbc9c104292edac3bb1d4a30f3afcda2f9556becaa26b45ace1e58426f488125db584486544a35c9c03b51755573f888b042714152310',	'2025-11-01 21:48:29.134',	'2025-10-25 21:48:29.137192'),
('df755a05-12fa-401f-87d6-f4a6f35d7857',	'e98a7d82-70b6-4045-b912-f3a872412e94',	'efd09564bbb85415d6e43e4d1b1b490e5549d60066c826fff3606bff36b311fc3cefa48a93d7d16b7f13cdc05ec6bc8f2f9eadec3e9ffb80482536ff5281fb64',	'2025-11-01 21:48:43.031',	'2025-10-25 21:48:43.032527'),
('b5edd8a3-b1ab-4366-9a29-3ee1ea7c5834',	'e98a7d82-70b6-4045-b912-f3a872412e94',	'4f198ef9ada60671dad8fc89bdfcd76c7e22d5e579977ac4a402d6b75be1655b2bda2ae967a9a0715651df9804de54bd24877ae33c54d9e2c008f4f1e7df5001',	'2025-11-01 22:01:28.713',	'2025-10-25 22:01:28.714707'),
('5039bee9-a3b2-4302-9b6d-c891a57a0c22',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'26487da2da5767d8d22d267813914f7e09154abc68e071e3b20890d07194e6ea7833875756d812326d537cf820fe1d87b8ea3d7daf47b2374ed1aa9fd874236f',	'2025-11-01 22:02:06.123',	'2025-10-25 22:02:06.124961'),
('2b6e6137-cf25-4287-a4a8-b539220cbbee',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'8c1aca1d08e720fc80f640ddeaac5cfda1c953829c0d6a3f3b42b49656ab94e127cca46b3a8eb48cfe12b72c1deda4e5cbb48c5b9e23829a86da28222acf4399',	'2025-11-01 22:04:22.925',	'2025-10-25 22:04:22.925538'),
('57ec09b9-481e-4dc5-8963-37cd75f0c7c5',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'cfe41a63f974f4b18c97b329c5642e1ef2687cc01e405a7375abadfeba23024e6a382cbb8a4dc24f856e244e3c2a62758446779aff29ad0374b70673bd992afa',	'2025-11-01 22:04:58.454',	'2025-10-25 22:04:58.454912'),
('7eb51ee1-113a-4d47-8594-db8b96fdcc09',	'e98a7d82-70b6-4045-b912-f3a872412e94',	'f8b2a37dc6037ec00ab35f3bdb0c56b186a3e1201c702ad03fa5dae4eccae7f63b70c40dba7a720e9d7adab9d521874b528931fe2496bf61aae87472a476b86e',	'2025-11-01 22:05:52.518',	'2025-10-25 22:05:52.519816'),
('13c88754-bf40-4fd8-9ff8-73c3abffe551',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'f26b372902f391774eb15034bbcd6d12d090f6c711a097c41a7a2d3160633e7d5f74d7ed77c55c192173bafb0cd8890004b091e41cc5b9c40f8f9727d4880147',	'2025-11-01 22:06:08.51',	'2025-10-25 22:06:08.511475'),
('9acbf1fe-d6e5-4739-b85f-cafb0143c60c',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'79764777086b8833275674b912107ae3a8962e5a4295993e19e833eccd9eae6d31bfd90750a91d4558e62987ff99fcc4348aa4c31af6a551bcc9bdbe01dc81ca',	'2025-11-01 22:12:47.832',	'2025-10-25 22:12:47.832972'),
('5872ec06-50fe-4d89-aac2-43132c11cbe3',	'e98a7d82-70b6-4045-b912-f3a872412e94',	'ca520b3b5eaa43123c30b8b8c660107af3b23b497341aeb58110ee454c47f1be7357822a2b162fc68688b3799234e81af7f6dbecd8229f0438e8cc1a126de428',	'2025-11-01 22:22:27.597',	'2025-10-25 22:22:27.597674'),
('3caa530a-9e78-4807-8bd3-e6714e82a64c',	'e98a7d82-70b6-4045-b912-f3a872412e94',	'fe099031102a5e9af49ab6b04a5310daaee1796b938375f575846cfd19d267f57dfe14231b83004ca38ad987cd48d7af111f158144c1d887d5770c469492c462',	'2025-11-01 22:24:50.086',	'2025-10-25 22:24:50.087005'),
('b4f68c22-d85d-4289-a5fb-8e703c334ec8',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'0b03e639889d4f217829b6fd87e476cecfe593465daf2e1ebc5717893c039c3cea6fa3822167a0a2ba0b08f56821933e214476e4e5fd56478421292f9defff4d',	'2025-11-01 22:26:37.006',	'2025-10-25 22:26:37.007636'),
('180ab037-ba78-4bca-968d-ca99adcb83ff',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'6f7a71d882fc80de5de02efa3b3983be5d9d91717fbc013e1c504b1d3ef6683378429caf6df808e478d6d8d2df4601ebe632b0f80d9f5033f78f6d532d6063ad',	'2025-11-01 22:28:45.736',	'2025-10-25 22:28:45.737468'),
('3ef049a3-162e-4705-84f9-f320ff7268dc',	'e98a7d82-70b6-4045-b912-f3a872412e94',	'666faf8ba00c88a60d81004935082e6f7e5fc54e95bbadd8acd60173b586a460e82366eedea572b2abb239326132f84c40cb34021e6894a909a2d485e3ecbde0',	'2025-11-01 22:31:32.374',	'2025-10-25 22:31:32.375377'),
('63bbfcd2-7125-4cc6-862b-7de1dddfc94b',	'e98a7d82-70b6-4045-b912-f3a872412e94',	'c6ac979ac485574d4ca9ec83b6b6bc61b536bacdd1a0d9a861f1937cde5c4ed58d05221dc8e9475b6fc303eaa6487213488b9cb960fd0f846a8fcced0d5f0ef7',	'2025-11-01 22:34:32.48',	'2025-10-25 22:34:32.481095'),
('36801766-0bd1-4a49-a374-6f7fe82adc1e',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'396ad61c1cefe60f378339dc3ef59f58d8e65ff53cae2bcfa0ba285129a876ce28ab5fdefce1b97f93642ae2cfa26b9b2313781f47ca7d1d4417c65273c759d9',	'2025-11-01 22:43:36.437',	'2025-10-25 22:43:36.437427'),
('fe1171ec-971f-4ef1-b60f-e7e8b67025c0',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'1830d31fc08c7a16b43a25b1fbbe8c239e0644da314f2d47963289465d5f0b2435428d76c2898a2b87527a498b72e4f4bdcf2d36a19c23cb0a50de3d04ad6ba0',	'2025-11-01 22:44:15.565',	'2025-10-25 22:44:15.566294'),
('cd5ecf4f-e33f-43cb-b30d-ea0bac461d6e',	'269c6146-37c9-4e57-b9c2-314e9715389e',	'77099ece41ebb643c054ebd71a1149f9c534f8264c10d1ae59d13e2b367ade2d37ec2c720f0d48ab50072c351840366e6833eb2cb8848d7e186f14607d6494d4',	'2025-11-01 23:03:50.644',	'2025-10-25 23:03:50.645343'),
('8dbc097c-a66e-4379-aa51-c1ad9bf822c7',	'2997ff14-a07e-4eaa-8e23-64a7fee3f7be',	'faa3593f0da1ee27f92f61fd1952f224650f4233c398b563e7beefa3a8933bb9a63d0ff33547d895b36a5b69accdcf59e2f4ba3e64c517a3d2102968ce46ce0c',	'2025-11-03 20:34:48.878',	'2025-10-27 20:34:48.879438'),
('e9b27693-23ac-47db-b655-f2f459285a28',	'2997ff14-a07e-4eaa-8e23-64a7fee3f7be',	'409df0e73d5fb3f889911f46b6dfe343bb4606c533aa2eca837e2225cd61296169b08a3a22e09097c640af96aa733948a24d44cd08a87c75b3f671c4df0ec3e7',	'2025-11-03 20:36:21.951',	'2025-10-27 20:36:21.952579'),
('a6ad1002-1014-489b-9185-5bf7c77ab8e1',	'2997ff14-a07e-4eaa-8e23-64a7fee3f7be',	'bd58daf1455bffc8ea70756282c371e09fcd545faa05523adb9fbdd72f5c520a565e0d3c5749701acc3b0a19e97edd972ac706ee0e224d1d44cda542030502ac',	'2025-11-03 21:00:49.361',	'2025-10-27 21:00:49.363511'),
('3fc54a86-a282-4beb-93be-f42ce842b3ce',	'2997ff14-a07e-4eaa-8e23-64a7fee3f7be',	'1e893c86b434ddf6e5db24ab5393f4390637b38d30b22ca17f25f42e25cdf198580d40ec55489ac9884e366a70326b7ebc698ab3b545b4f5abaaef291b4b2f3f',	'2025-11-03 21:02:37.778',	'2025-10-27 21:02:37.779971'),
('a90f4154-ecd5-4667-b14e-9c77bb8babc4',	'2997ff14-a07e-4eaa-8e23-64a7fee3f7be',	'2a6ce15368d1d0c61645a8381d4cd847de62174311bb6672233d5c471c19e4ba5f5b07c3b35b9afb2c26dd817f0024318ce50736ec153634df7953eb3c29faf0',	'2025-11-03 21:04:17.21',	'2025-10-27 21:04:17.211117'),
('04a024a7-60e3-4bc7-b85a-086a7d55022d',	'2997ff14-a07e-4eaa-8e23-64a7fee3f7be',	'c7e44175e6aa0323e13820faff5fd97e39f34a192cef1ce496963501b8ae0d6afc0d7e5f12c8474ec38de18688a960715fca12fc2b5c5744dc93c5cc54139ff3',	'2025-11-03 21:06:05.192',	'2025-10-27 21:06:05.194285'),
('f69d3957-32eb-4aef-b90a-2de29ae951fb',	'2997ff14-a07e-4eaa-8e23-64a7fee3f7be',	'3c2713968597f7a16d3f11ed335c6b4ed0b96129a0a22d26f8820eb2ad08e891d5c0ef2e57955846eadb033a4cfdd68af8daedf62abab2230a0c567d9ce42fdc',	'2025-11-03 21:24:09.863',	'2025-10-27 21:24:09.864747'),
('eba9554a-c4da-4238-942a-8106fc74fa28',	'2997ff14-a07e-4eaa-8e23-64a7fee3f7be',	'36df63ed9a7d399d8170d6cd2230de81297aab905d51faa9286431a07ba7930a9af968ba5ae9f9c6a2456012d44a11548b89af6847eee70f5c83cde94186f92c',	'2025-11-03 21:27:21.563',	'2025-10-27 21:27:21.564676'),
('95eed290-10c4-41c5-ac4f-ebe9d021c06a',	'2997ff14-a07e-4eaa-8e23-64a7fee3f7be',	'5a9f59583d8ae9e966af5b119e76efe0df2ce67d0bcacdcdfe8c3a9480186d38cb5efefaa669dfc6578fcd7bcac9f85e8b209d07d22a5a3e41f57a5b219a1ea2',	'2025-11-03 22:23:31.215',	'2025-10-27 22:23:31.217055'),
('bdab6e5b-9a3f-4f7a-9df2-283b50425234',	'2997ff14-a07e-4eaa-8e23-64a7fee3f7be',	'00cea3397a051b191d123a8cd7bc3f7d97b0423ec711f958979a0df945bd428673702f8686396cafb17b57b01291076b5ab54aba58355783e130e802d5ee297f',	'2025-11-03 22:23:50.478',	'2025-10-27 22:23:50.479826'),
('eff2e28e-4c14-4817-96b0-823aace819c9',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'41b390fa75296ac5e56b7fd99990be4da465889d431ad69f801cfef91fc369890e287160e88ca7f7fc26478e14b8c82498568d3003d8b4f55ed12f9db2d398f3',	'2025-11-03 22:26:07.021',	'2025-10-27 22:26:07.022329');

CREATE TABLE "public"."resident_profiles" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "user_id" uuid,
    "property_id" uuid,
    "unit_id" uuid,
    "move_in_date" date,
    "contact_preferences" jsonb,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now(),
    "image" text,
    CONSTRAINT "resident_profiles_pkey" PRIMARY KEY ("id")
)
WITH (oids = false);

CREATE UNIQUE INDEX resident_profiles_user_id_key ON public.resident_profiles USING btree (user_id);

TRUNCATE "resident_profiles";

CREATE TABLE "public"."reviews" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "reviewer_id" uuid,
    "reviewed_user_id" uuid,
    "job_id" uuid,
    "rating" integer,
    "comment" text,
    "created_at" timestamp DEFAULT now(),
    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reviews_rating_check" CHECK ((rating >= 1) AND (rating <= 5))
)
WITH (oids = false);

TRUNCATE "reviews";

CREATE TABLE "public"."subscriptions" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "user_id" uuid,
    "entrepreneur_profile_id" uuid,
    "stripe_customer_id" character varying(255),
    "stripe_subscription_id" character varying(255),
    "plan_type" character varying(50),
    "status" character varying(50),
    "trial_end" timestamp,
    "current_period_start" timestamp,
    "current_period_end" timestamp,
    "cancel_at_period_end" boolean DEFAULT false,
    "canceled_at" timestamp,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now(),
    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
)
WITH (oids = false);

CREATE UNIQUE INDEX unique_entrepreneur_subscription ON public.subscriptions USING btree (entrepreneur_profile_id);

CREATE UNIQUE INDEX unique_user_subscription ON public.subscriptions USING btree (user_id);

TRUNCATE "subscriptions";
INSERT INTO "subscriptions" ("id", "user_id", "entrepreneur_profile_id", "stripe_customer_id", "stripe_subscription_id", "plan_type", "status", "trial_end", "current_period_start", "current_period_end", "cancel_at_period_end", "canceled_at", "created_at", "updated_at") VALUES
('e902e8ac-f109-448d-a10b-04e9384252b8',	'e98a7d82-70b6-4045-b912-f3a872412e94',	'a1c15fe7-fbfa-4ef5-b327-d4e7efb90308',	'cus_TIj7jzPQLB3hxj',	'sub_1SM8ZG5Dbv5aHRPT2Kzrc7IS',	'premium',	'trialing',	'2025-11-08 22:35:42',	'2025-10-25 22:35:43.904',	'2025-11-24 22:35:43.904',	'f',	NULL,	'2025-10-25 22:35:43.905581',	'2025-10-25 22:35:43.905581'),
('7b89dd52-1759-41b2-9111-c9e9f7667a77',	'0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'0b0e08ca-a167-497d-a86e-05c675419d46',	'cus_TFztXDolm7kxL4',	'sub_1SM8hH5Dbv5aHRPTr1VDxX6B',	'basic',	'trialing',	'2025-11-08 22:43:59',	'2025-10-25 22:44:01.349',	'2025-11-24 22:44:01.349',	'f',	NULL,	'2025-10-25 22:44:01.351558',	'2025-10-25 22:44:01.351558'),
('c6e8968c-21d2-4867-a44d-58ff67f71771',	'269c6146-37c9-4e57-b9c2-314e9715389e',	'9bc88495-d16a-4c4b-9f84-5f2ca0a5a6ee',	'cus_TIkV7Q5jBxSHgF',	'sub_1SM90v5Dbv5aHRPTmFFJ6sJC',	'premium',	'trialing',	'2025-11-08 23:04:17',	'2025-10-25 23:04:19.877',	'2025-11-24 23:04:19.877',	'f',	NULL,	'2025-10-25 23:04:19.879141',	'2025-10-25 23:04:19.879141'),
('fa41eaa7-84d0-45ec-91cf-aab0120c5fb8',	'2997ff14-a07e-4eaa-8e23-64a7fee3f7be',	'30ef57c4-80ce-49bd-aba6-c2b151ba8589',	'cus_TJSZJpUvTuoNj0',	'sub_1SMpef5Dbv5aHRPTUoN7i9Tb',	'basic',	'trialing',	'2025-11-10 20:36:09',	'2025-10-27 20:36:10.879',	'2025-11-26 20:36:10.879',	'f',	NULL,	'2025-10-27 20:36:10.881298',	'2025-10-27 20:36:10.881298');

CREATE TABLE "public"."supplier_invoices" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "request_id" uuid,
    "items" jsonb,
    "total_amount" numeric(12,2),
    "delivery_terms" text,
    "status" character varying(50),
    "created_at" timestamp DEFAULT now(),
    CONSTRAINT "supplier_invoices_pkey" PRIMARY KEY ("id")
)
WITH (oids = false);

TRUNCATE "supplier_invoices";

CREATE TABLE "public"."supplier_profiles" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "user_id" uuid,
    "company_name" character varying(255),
    "address" text,
    "phone" character varying(30),
    "website" character varying(255),
    "catalog_pdf_url" text,
    "business_license" text,
    "years_in_business" integer,
    "delivery_areas" text[],
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now(),
    CONSTRAINT "supplier_profiles_pkey" PRIMARY KEY ("id")
)
WITH (oids = false);

CREATE UNIQUE INDEX supplier_profiles_user_id_key ON public.supplier_profiles USING btree (user_id);

TRUNCATE "supplier_profiles";

CREATE TABLE "public"."supplier_requests" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "entrepreneur_id" uuid,
    "supplier_id" uuid,
    "request_details" text,
    "status" character varying(50),
    "created_at" timestamp DEFAULT now(),
    CONSTRAINT "supplier_requests_pkey" PRIMARY KEY ("id")
)
WITH (oids = false);

TRUNCATE "supplier_requests";

CREATE TABLE "public"."units" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "property_id" uuid,
    "unit_number" character varying(50),
    "floor" integer,
    "bedrooms" integer,
    "bathrooms" integer,
    "square_feet" numeric(10,2),
    "is_occupied" boolean DEFAULT false,
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now(),
    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
)
WITH (oids = false);

TRUNCATE "units";

CREATE TABLE "public"."users" (
    "id" uuid DEFAULT uuid_generate_v4() NOT NULL,
    "email" character varying(255) NOT NULL,
    "password" text,
    "role" character varying(50),
    "first_name" character varying(100),
    "middle_name" character varying(100),
    "last_name" character varying(100),
    "phone" character varying(30),
    "created_at" timestamp DEFAULT now(),
    "updated_at" timestamp DEFAULT now(),
    "email_verified" boolean DEFAULT false,
    "verification_token" text,
    "verification_token_expires" timestamp,
    "reset_token" text,
    "reset_token_expires" timestamp,
    "stripe_customer_id" character varying(255),
    "provider" character varying(10) DEFAULT 'local' NOT NULL,
    "provider_id" character varying(255),
    CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "users_provider_check" CHECK ((provider)::text = ANY ((ARRAY['local'::character varying, 'google'::character varying])::text[]))
)
WITH (oids = false);

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);

TRUNCATE "users";
INSERT INTO "users" ("id", "email", "password", "role", "first_name", "middle_name", "last_name", "phone", "created_at", "updated_at", "email_verified", "verification_token", "verification_token_expires", "reset_token", "reset_token_expires", "stripe_customer_id", "provider", "provider_id") VALUES
('20a5237e-4cd1-46c3-8156-8ad089ed370a',	'test@example.com',	'$2b$10$LSoFWFfBCWn5sm42pyNLpO.NjxsRSHhDHDng4rqg4m79.HuK/V8R2',	'entrepreneur',	'John',	NULL,	'Doe',	NULL,	'2025-10-16 22:00:10.494187',	'2025-10-16 22:00:10.494187',	't',	NULL,	NULL,	NULL,	NULL,	NULL,	'local',	NULL),
('66cc3b80-a60d-4f32-8934-bc167a96b162',	'dave@example.com',	'$2b$10$Wtm0jB2npGuyKNGYY9JqjOD7nIYWdSlucmljlYwgPMEvqIoGJdMVG',	'entrepreneur',	'David',	'Michael',	'Smith',	'+1234567890',	'2025-10-17 13:57:44.486739',	'2025-10-17 14:17:38.026931',	't',	NULL,	NULL,	NULL,	NULL,	NULL,	'local',	NULL),
('dd197719-7816-4215-9bce-791273dd1181',	'manager@example.com',	'$2b$10$aYzvf/yN/A4JhkmB1otMKeZtGj9Og/0zOriVfutsyhgMKK59wF20G',	'property_manager',	'Jane',	NULL,	'Manager',	NULL,	'2025-10-17 14:34:47.808386',	'2025-10-17 14:34:47.808386',	't',	'a2ab03bfbfcf2c549fb8a3819097f9378e62cf7dffea46f8c4eca9e97e9f6f04',	'2025-10-18 14:34:47.793',	NULL,	NULL,	NULL,	'local',	NULL),
('e7ae5e71-419a-440f-8b60-3b72058b055e',	'manager@test.com',	'$2b$10$L5OFjs/Bpsi/jZ5YGL.KseslVobakfK60OxjM58.ANmp1YvwbOla6',	'property_manager',	'Jane',	NULL,	'Manager',	NULL,	'2025-10-17 16:51:28.411398',	'2025-10-17 16:51:28.411398',	't',	NULL,	NULL,	NULL,	NULL,	NULL,	'local',	NULL),
('0b8c4d5f-6b93-4748-b52e-8c567bc8ba8b',	'entrepreneur@test.com',	'$2b$10$otqW9wW5..7XMW4LoLPLBOcrCfabyknCcOROSpUtSs6s/efVeyXSq',	'entrepreneur',	'John',	NULL,	'Builder',	NULL,	'2025-10-17 16:47:58.644688',	'2025-10-17 16:47:58.644688',	't',	NULL,	NULL,	NULL,	NULL,	'cus_TFztXDolm7kxL4',	'local',	NULL),
('6672cc03-c854-4c81-89bc-d4011d76ceea',	'test.entrepreneur@example.com',	'$2b$10$k3M5e2wcLBz0KLT5HaqqG.zvUtQ8VbY7dpOJQkPWkuFN02IGvUOV6',	'entrepreneur',	'Test',	NULL,	'Entrepreneur',	NULL,	'2025-10-18 17:53:34.028596',	'2025-10-18 17:53:34.028596',	't',	'e20c9b11f5b768e1a79add5881f6a19d4feffc4cf940b3407a091cdd43f4e9ab',	'2025-10-19 17:53:34.028',	NULL,	NULL,	'cus_TG4dds41I1h4kJ',	'local',	NULL),
('7545ee49-04aa-4a3c-9499-d4def6371953',	'test.manager@example.com',	'$2b$10$HZ5pu3KMr/wTgvmsuqMJcOh4szU289CJqVDFHI0mgy65RIOX4mq8i',	'property_manager',	'Test',	NULL,	'Entrepreneur',	NULL,	'2025-10-19 20:08:45.473098',	'2025-10-19 20:08:45.473098',	'f',	'c52666c848e69b5aca4294c83d25e8a33c10cc81a5e3d76a18f7d4d9eb3aa491',	'2025-10-20 20:08:45.472',	NULL,	NULL,	NULL,	'local',	NULL),
('146ab336-0633-491a-b01c-c041b1074dfe',	'test2@example.com',	'$2b$10$hDd5JW.ufxRIV88SDlEq9O0HxwGuTzIlmbLGvS2ezQbfQoELkzjry',	'property_manager',	'John',	NULL,	'Doe',	NULL,	'2025-10-15 20:34:18.914543',	'2025-10-15 20:34:18.914543',	'f',	NULL,	NULL,	NULL,	NULL,	NULL,	'local',	NULL),
('c9050d5a-0831-44d1-bf95-3b2510468127',	'jordan@example.com',	'$2b$10$kjiH1u3x84F0jjnWR2ykUuMCquL7Jbv/7/AUjEc7FjyzILOVwYYSS',	'property_manager',	'John',	NULL,	'Doe',	NULL,	'2025-10-15 20:35:15.076778',	'2025-10-15 20:35:15.076778',	'f',	NULL,	NULL,	NULL,	NULL,	NULL,	'local',	NULL),
('d782109f-04bd-4449-96f7-ead067caa101',	'mark@example.com',	'$2b$10$FE0UCQ4eV5EDVrWSYp4fgeJqDarnsjuWACMGf4m6m5ncdn3u.z0UW',	'property_manager',	'John',	NULL,	'Doe',	NULL,	'2025-10-15 20:37:04.370361',	'2025-10-15 20:37:04.370361',	'f',	NULL,	NULL,	NULL,	NULL,	NULL,	'local',	NULL),
('6ec0d9cb-02d4-40cc-8abb-f2c3fd92abab',	'markk@example.com',	'$2b$10$EPpxCmdZUwW96M1NI5mFUeG1kcnwkRzv25Xo.noDQ5v02EK/BaFs6',	'property_manager',	'John',	NULL,	'Doe',	NULL,	'2025-10-15 20:42:31.847611',	'2025-10-15 20:42:31.847611',	'f',	NULL,	NULL,	NULL,	NULL,	NULL,	'local',	NULL),
('933e4932-9877-4d09-bd8c-e17fd564c262',	'entrepreneur@example.com',	'$2b$10$05AlrAEeRXwr33SmpdHBLewN6p67nZGmZpc7/LGflBZRSYek4bSp6',	'entrepreneur',	'John',	NULL,	'Doe',	NULL,	'2025-10-25 13:42:58.987412',	'2025-10-25 13:42:58.987412',	't',	NULL,	NULL,	NULL,	NULL,	NULL,	'local',	NULL),
('1c5c729c-5318-4ce1-90ae-8167c05f1956',	'jordan@gmail.com',	'$2b$10$avMjNVajFVlyZOPwTwsmmunkuKDmO26CVh.nA7FdbuQswikfPGnXS',	'entrepreneur',	'Jordan',	NULL,	'Tanga',	NULL,	'2025-10-25 20:34:35.775982',	'2025-10-25 20:34:35.775982',	't',	NULL,	NULL,	NULL,	NULL,	NULL,	'local',	NULL),
('e98a7d82-70b6-4045-b912-f3a872412e94',	'silverdaveramos@gmail.com',	'$2b$10$VW2PQNzt10mr54lJWiwz/OHJOajk9D5pPBnR33/YsF.bCvKyaISkC',	'entrepreneur',	'SIlver Dave',	NULL,	'Ramos',	NULL,	'2025-10-25 20:29:43.93835',	'2025-10-25 20:29:43.93835',	't',	NULL,	NULL,	NULL,	NULL,	'cus_TIj7jzPQLB3hxj',	'local',	NULL),
('269c6146-37c9-4e57-b9c2-314e9715389e',	'hairthlayla@gmail.com',	'$2b$10$N0NoCPcwz3BgGzdBY0WgAOd9d1Lgv6JX7Gk2hdQWfIOCDrC48.DBq',	'entrepreneur',	'Harith',	NULL,	'Layla',	NULL,	'2025-10-25 23:03:27.981468',	'2025-10-25 23:03:27.981468',	't',	NULL,	NULL,	NULL,	NULL,	'cus_TIkV7Q5jBxSHgF',	'local',	NULL),
('2997ff14-a07e-4eaa-8e23-64a7fee3f7be',	'silverdaveramos021503@gmail.com',	NULL,	'entrepreneur',	'Silver Dave',	NULL,	'Ramos',	'0923748320',	'2025-10-27 20:24:08.776765',	'2025-10-27 20:24:08.776765',	't',	NULL,	NULL,	NULL,	NULL,	'cus_TJSZJpUvTuoNj0',	'google',	'104297541521086933261');

ALTER TABLE ONLY "public"."bid_counts" ADD CONSTRAINT "bid_counts_entrepreneur_profile_id_fkey" FOREIGN KEY (entrepreneur_profile_id) REFERENCES entrepreneur_profiles(id) ON DELETE CASCADE NOT DEFERRABLE;

ALTER TABLE ONLY "public"."bids" ADD CONSTRAINT "bids_entrepreneur_id_fkey" FOREIGN KEY (entrepreneur_id) REFERENCES entrepreneur_profiles(id) ON DELETE CASCADE NOT DEFERRABLE;
ALTER TABLE ONLY "public"."bids" ADD CONSTRAINT "bids_job_id_fkey" FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE NOT DEFERRABLE;

ALTER TABLE ONLY "public"."budget_unlocks" ADD CONSTRAINT "budget_unlocks_entrepreneur_id_fkey" FOREIGN KEY (entrepreneur_id) REFERENCES entrepreneur_profiles(id) ON DELETE CASCADE NOT DEFERRABLE;
ALTER TABLE ONLY "public"."budget_unlocks" ADD CONSTRAINT "budget_unlocks_job_id_fkey" FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE NOT DEFERRABLE;

ALTER TABLE ONLY "public"."conversations" ADD CONSTRAINT "conversations_job_id_fkey" FOREIGN KEY (job_id) REFERENCES jobs(id) NOT DEFERRABLE;
ALTER TABLE ONLY "public"."conversations" ADD CONSTRAINT "conversations_participant1_id_fkey" FOREIGN KEY (participant1_id) REFERENCES users(id) ON DELETE CASCADE NOT DEFERRABLE;
ALTER TABLE ONLY "public"."conversations" ADD CONSTRAINT "conversations_participant2_id_fkey" FOREIGN KEY (participant2_id) REFERENCES users(id) ON DELETE CASCADE NOT DEFERRABLE;

ALTER TABLE ONLY "public"."entrepreneur_profiles" ADD CONSTRAINT "entrepreneur_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE NOT DEFERRABLE;

ALTER TABLE ONLY "public"."favorites" ADD CONSTRAINT "favorites_entrepreneur_id_fkey" FOREIGN KEY (entrepreneur_id) REFERENCES entrepreneur_profiles(id) ON DELETE CASCADE NOT DEFERRABLE;
ALTER TABLE ONLY "public"."favorites" ADD CONSTRAINT "favorites_manager_id_fkey" FOREIGN KEY (manager_id) REFERENCES manager_profiles(id) ON DELETE CASCADE NOT DEFERRABLE;

ALTER TABLE ONLY "public"."images" ADD CONSTRAINT "images_job_id_fkey" FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE NOT DEFERRABLE;
ALTER TABLE ONLY "public"."images" ADD CONSTRAINT "images_review_id_fkey" FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE NOT DEFERRABLE;

ALTER TABLE ONLY "public"."inspection_reports" ADD CONSTRAINT "inspection_reports_property_id_fkey" FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE NOT DEFERRABLE;
ALTER TABLE ONLY "public"."inspection_reports" ADD CONSTRAINT "inspection_reports_uploaded_by_fkey" FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL NOT DEFERRABLE;

ALTER TABLE ONLY "public"."jobs" ADD CONSTRAINT "jobs_manager_id_fkey" FOREIGN KEY (manager_id) REFERENCES manager_profiles(id) ON DELETE CASCADE NOT DEFERRABLE;
ALTER TABLE ONLY "public"."jobs" ADD CONSTRAINT "jobs_property_id_fkey" FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE NOT DEFERRABLE;

ALTER TABLE ONLY "public"."manager_profiles" ADD CONSTRAINT "manager_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE NOT DEFERRABLE;

ALTER TABLE ONLY "public"."messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE NOT DEFERRABLE;
ALTER TABLE ONLY "public"."messages" ADD CONSTRAINT "messages_job_id_fkey" FOREIGN KEY (job_id) REFERENCES jobs(id) NOT DEFERRABLE;
ALTER TABLE ONLY "public"."messages" ADD CONSTRAINT "messages_receiver_id_fkey" FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE NOT DEFERRABLE;
ALTER TABLE ONLY "public"."messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE NOT DEFERRABLE;

ALTER TABLE ONLY "public"."properties" ADD CONSTRAINT "properties_manager_id_fkey" FOREIGN KEY (manager_id) REFERENCES manager_profiles(id) ON DELETE CASCADE NOT DEFERRABLE;

ALTER TABLE ONLY "public"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE NOT DEFERRABLE;

ALTER TABLE ONLY "public"."resident_profiles" ADD CONSTRAINT "resident_profiles_property_id_fkey" FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE NOT DEFERRABLE;
ALTER TABLE ONLY "public"."resident_profiles" ADD CONSTRAINT "resident_profiles_unit_id_fkey" FOREIGN KEY (unit_id) REFERENCES units(id) NOT DEFERRABLE;
ALTER TABLE ONLY "public"."resident_profiles" ADD CONSTRAINT "resident_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE NOT DEFERRABLE;

ALTER TABLE ONLY "public"."reviews" ADD CONSTRAINT "reviews_job_id_fkey" FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL NOT DEFERRABLE;
ALTER TABLE ONLY "public"."reviews" ADD CONSTRAINT "reviews_reviewed_user_id_fkey" FOREIGN KEY (reviewed_user_id) REFERENCES users(id) ON DELETE CASCADE NOT DEFERRABLE;
ALTER TABLE ONLY "public"."reviews" ADD CONSTRAINT "reviews_reviewer_id_fkey" FOREIGN KEY (reviewer_id) REFERENCES users(id) ON DELETE CASCADE NOT DEFERRABLE;

ALTER TABLE ONLY "public"."subscriptions" ADD CONSTRAINT "subscriptions_entrepreneur_profile_id_fkey" FOREIGN KEY (entrepreneur_profile_id) REFERENCES entrepreneur_profiles(id) ON DELETE CASCADE NOT DEFERRABLE;
ALTER TABLE ONLY "public"."subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE NOT DEFERRABLE;

ALTER TABLE ONLY "public"."supplier_invoices" ADD CONSTRAINT "supplier_invoices_request_id_fkey" FOREIGN KEY (request_id) REFERENCES supplier_requests(id) ON DELETE CASCADE NOT DEFERRABLE;

ALTER TABLE ONLY "public"."supplier_profiles" ADD CONSTRAINT "supplier_profiles_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE NOT DEFERRABLE;

ALTER TABLE ONLY "public"."supplier_requests" ADD CONSTRAINT "supplier_requests_entrepreneur_id_fkey" FOREIGN KEY (entrepreneur_id) REFERENCES entrepreneur_profiles(id) ON DELETE CASCADE NOT DEFERRABLE;
ALTER TABLE ONLY "public"."supplier_requests" ADD CONSTRAINT "supplier_requests_supplier_id_fkey" FOREIGN KEY (supplier_id) REFERENCES supplier_profiles(id) ON DELETE CASCADE NOT DEFERRABLE;

ALTER TABLE ONLY "public"."units" ADD CONSTRAINT "units_property_id_fkey" FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE NOT DEFERRABLE;

-- 2025-10-27 14:40:23 UTC

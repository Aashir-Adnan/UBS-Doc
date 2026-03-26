import { useState, useCallback } from "react";

// ─── THEME ────────────────────────────────────────────────────────────────────
const T = {
  bg:         "#0f0f11",
  surface:    "#16161a",
  surfaceHi:  "#1e1e24",
  border:     "#2a2a35",
  borderHi:   "#3a3a48",
  text:       "#e8e6f0",
  textMuted:  "#7a7890",
  textDim:    "#4a4860",

  // cluster colours
  contentFill:   "#0e1a2e",
  contentBorder: "#1e4080",
  contentAccent: "#3b82f6",
  contentText:   "#93c5fd",

  deliveryFill:   "#0e2218",
  deliveryBorder: "#1a5c38",
  deliveryAccent: "#22c55e",
  deliveryText:   "#86efac",

  responseFill:   "#1e1508",
  responseBorder: "#6b4a0a",
  responseAccent: "#f59e0b",
  responseText:   "#fcd34d",

  coreFill:   "#1a0e2e",
  coreBorder: "#5b21b6",
  coreAccent: "#a855f7",
  coreText:   "#d8b4fe",

  dropped:    "#2a0f0f",
  droppedBdr: "#7f1d1d",
  droppedAcc: "#ef4444",
  droppedTxt: "#fca5a5",

  kept:       "#0f1a0f",
  keptBdr:    "#14532d",
  keptAcc:    "#4ade80",
  keptTxt:    "#bbf7d0",

  arrow:      "#5b5880",
  arrowHi:    "#a855f7",
};

// ─── INITIAL DATA ─────────────────────────────────────────────────────────────
const INITIAL_DATA = {
  title: "QuranFlow — Database Migration",
  subtitle: "Old schema (82 tables) → New unified schema (22 core tables)",

  clusters: [
    // ── CONTENT ──────────────────────────────────────────────────────────────
    {
      id: "content-old",
      side: "old",
      cluster: "content",
      label: "Content cluster — OLD",
      annotation: "15 separate tables each with their own schema, semester-plan bridges, and inconsistent level-tag scoping. Adding a new content type required a new table + bridge + plan table.",
      tables: [
        {
          id: "lessons",
          name: "lessons",
          status: "migrated",
          migratesTo: "qf_delivery (type=lesson)",
          columns: [
            { name: "ls_id", type: "PK", note: "" },
            { name: "ls_description", type: "text", note: "→ qf_delivery.title" },
            { name: "ls_level_tags", type: "varchar", note: "→ config: level_tags" },
            { name: "ls_posted_date", type: "date", note: "→ config: post_date" },
            { name: "ls_posted_days", type: "int", note: "→ config: post_week" },
            { name: "is_understand", type: "tinyint", note: "→ config: is_understand_required" },
            { name: "elective_id", type: "int", note: "→ config: elective_id" },
            { name: "is_core_lesson", type: "tinyint", note: "→ config: is_core" },
          ],
        },
        {
          id: "lesson_link_video",
          name: "lesson_link_video",
          status: "migrated",
          migratesTo: "qf_resource (resource_type=video) + qf_content_delivery",
          columns: [
            { name: "llv_id", type: "PK", note: "" },
            { name: "ls_id", type: "FK", note: "→ delivery via qf_content_delivery" },
            { name: "llv_title", type: "varchar", note: "→ config: display_name" },
            { name: "llv_link", type: "varchar", note: "→ config: link_url" },
            { name: "llv_description", type: "text", note: "→ config: resource_description" },
            { name: "llv_levels", type: "varchar", note: "→ config: visible_to_designation" },
            { name: "llv_posted_date", type: "date", note: "→ config: available_from" },
          ],
        },
        {
          id: "lesson_semester_plans",
          name: "lesson_semester_plans",
          status: "migrated",
          migratesTo: "qf_delivery.semester_id + qf_config",
          columns: [
            { name: "lesson_plan_id", type: "PK", note: "" },
            { name: "semester_id", type: "int", note: "→ qf_delivery.semester_id" },
            { name: "lesson_id", type: "FK", note: "→ delivery_id (resolved at migration)" },
          ],
        },
        {
          id: "resource",
          name: "resource",
          status: "migrated",
          migratesTo: "qf_resource (resource_type=attachment) + qf_content_delivery",
          columns: [
            { name: "id", type: "PK", note: "" },
            { name: "res_title", type: "varchar", note: "→ config: display_name" },
            { name: "res_description", type: "text", note: "→ config: resource_description" },
            { name: "res_link", type: "varchar", note: "→ config: link_url" },
            { name: "res_file", type: "varchar", note: "→ attachment_id (file store ref)" },
            { name: "res_type", type: "varchar", note: "→ config: resource_type" },
            { name: "res_order", type: "int", note: "→ config: sequence" },
            { name: "elective_id", type: "int", note: "→ config: elective_id" },
            { name: "is_core_resource", type: "tinyint", note: "→ config: is_core" },
          ],
        },
        {
          id: "resource_semester_plan",
          name: "resource_semester_plan",
          status: "migrated",
          migratesTo: "qf_content_delivery + qf_config",
          columns: [
            { name: "resource_plan_id", type: "PK", note: "" },
            { name: "semester_id", type: "int", note: "→ config: visible_to_semester_id" },
            { name: "resource_id", type: "FK", note: "→ qf_resource.resource_id" },
            { name: "res_level_tags", type: "varchar", note: "→ config: visible_to_designation" },
          ],
        },
        {
          id: "ta_recordings",
          name: "ta_recordings",
          status: "migrated",
          migratesTo: "qf_delivery (type=ta_recording)",
          columns: [
            { name: "id", type: "PK", note: "" },
            { name: "r_title", type: "varchar", note: "→ qf_delivery.title" },
            { name: "r_description", type: "text", note: "→ qf_delivery.description" },
            { name: "r_link", type: "varchar", note: "→ config: session_link" },
            { name: "r_level_tags", type: "varchar", note: "→ config: level_tags" },
            { name: "r_teaching_assistant", type: "int", note: "→ config: teaching_assistant_id" },
            { name: "r_recording_type", type: "varchar", note: "→ config: recording_type" },
            { name: "gender_scope", type: "varchar", note: "→ config: session_gender_scope" },
            { name: "elective_id", type: "int", note: "→ config: elective_id" },
            { name: "is_core_recording", type: "tinyint", note: "→ config: is_core" },
          ],
        },
        {
          id: "tutorials",
          name: "tutorials",
          status: "migrated",
          migratesTo: "qf_delivery (type=tutorial)",
          columns: [
            { name: "id", type: "PK", note: "" },
            { name: "tut_title", type: "varchar", note: "→ qf_delivery.title" },
            { name: "tut_description", type: "text", note: "→ qf_delivery.description" },
            { name: "tut_link", type: "varchar", note: "→ qf_resource + qf_content_delivery" },
            { name: "tut_file", type: "varchar", note: "→ qf_resource (attachment_id)" },
            { name: "tut_video_link", type: "varchar", note: "→ qf_resource (resource_type=video)" },
            { name: "tut_type", type: "varchar", note: "→ config: tutorial_type" },
          ],
        },
        {
          id: "tutorial_semester_plan",
          name: "tutorial_semester_plan",
          status: "migrated",
          migratesTo: "qf_delivery.semester_id + qf_config",
          columns: [
            { name: "tutorial_plan_id", type: "PK", note: "" },
            { name: "semester_id", type: "int", note: "→ qf_delivery.semester_id" },
            { name: "tutorial_id", type: "FK", note: "" },
            { name: "level_tag_id", type: "int", note: "→ config: designation_id" },
          ],
        },
        {
          id: "welcome_videos",
          name: "welcome_videos",
          status: "migrated",
          migratesTo: "qf_delivery (type=welcome_video)",
          columns: [
            { name: "id", type: "PK", note: "" },
            { name: "title", type: "varchar", note: "→ qf_delivery.title" },
            { name: "description", type: "text", note: "→ qf_delivery.description" },
            { name: "video_url", type: "varchar", note: "→ qf_resource + qf_content_delivery" },
            { name: "thumbnail_url", type: "varchar", note: "→ qf_resource (resource_type=thumbnail)" },
            { name: "level_tag_id", type: "int", note: "→ config: designation_id" },
            { name: "elective_id", type: "int", note: "→ config: elective_id" },
            { name: "is_year2_core", type: "tinyint", note: "→ config: is_core" },
            { name: "is_active", type: "tinyint", note: "→ config: is_active" },
            { name: "display_order", type: "int", note: "→ config: sequence" },
          ],
        },
        {
          id: "electives",
          name: "electives",
          status: "dissolved",
          migratesTo: "Dissolved → config keys on qf_delivery",
          columns: [
            { name: "id", type: "PK", note: "" },
            { name: "name", type: "varchar", note: "→ config: elective_name (inline per delivery)" },
            { name: "is_practice_only", type: "tinyint", note: "→ config: is_practice_only" },
          ],
        },
        {
          id: "support_links",
          name: "support_links",
          status: "migrated",
          migratesTo: "qf_resource (resource_type=support_link)",
          columns: [
            { name: "id", type: "PK", note: "" },
            { name: "name", type: "varchar", note: "→ config: display_name" },
            { name: "telegram_link", type: "varchar", note: "→ config: link_url, platform=telegram" },
            { name: "year", type: "int", note: "→ config: target_year" },
            { name: "gender", type: "varchar", note: "→ config: gender_scope" },
            { name: "is_active", type: "tinyint", note: "→ config: is_active" },
          ],
        },
        {
          id: "email_templates",
          name: "email_templates",
          status: "migrated",
          migratesTo: "qf_payload (type=email_template)",
          columns: [
            { name: "id", type: "PK", note: "" },
            { name: "subject", type: "varchar", note: "→ config: email_subject" },
            { name: "name", type: "varchar", note: "→ config: template_name" },
            { name: "html", type: "mediumtext", note: "→ qf_payload.body" },
          ],
        },
        {
          id: "mail_merger",
          name: "mail_merger",
          status: "migrated",
          migratesTo: "qf_payload (type=mail_variable)",
          columns: [
            { name: "id", type: "PK", note: "" },
            { name: "name", type: "varchar", note: "→ config: merger_variable_name" },
            { name: "type", type: "varchar", note: "→ config: merger_variable_type" },
            { name: "testing_replacement_text", type: "text", note: "→ config: merger_testing_value" },
          ],
        },
        {
          id: "page_content",
          name: "page_content",
          status: "migrated",
          migratesTo: "qf_payload (type=page_content)",
          columns: [
            { name: "id", type: "PK", note: "" },
            { name: "page_key", type: "varchar", note: "→ config: page_key" },
            { name: "title", type: "varchar", note: "→ config: page_title" },
            { name: "content", type: "text", note: "→ qf_payload.body" },
          ],
        },
        {
          id: "notes",
          name: "notes",
          status: "migrated",
          migratesTo: "qf_payload (type=note)",
          columns: [
            { name: "id", type: "PK", note: "" },
            { name: "body", type: "text", note: "→ qf_payload.body" },
          ],
        },
      ],
    },

    // ── DELIVERY ─────────────────────────────────────────────────────────────
    {
      id: "delivery-old",
      side: "old",
      cluster: "delivery",
      label: "Delivery cluster — OLD",
      annotation: "Three separate content types (assessment, quiz, MCQ) each had their own table lineage. Adding scheduling or audience filters required schema changes. TA sessions lived in a completely separate island.",
      tables: [
        {
          id: "assessment",
          name: "assessment",
          status: "migrated",
          migratesTo: "qf_delivery (type=assessment)",
          columns: [
            { name: "assessment_id", type: "PK", note: "" },
            { name: "title", type: "varchar", note: "→ qf_delivery.title" },
            { name: "discription", type: "text", note: "→ qf_delivery.description" },
            { name: "content", type: "text", note: "→ qf_payload (type=body)" },
            { name: "owner_id", type: "int", note: "→ qf_delivery.owner_id" },
            { name: "assessment_week", type: "int", note: "→ config: assessment_week" },
            { name: "assessment_week_day", type: "int", note: "→ config: assessment_week_day" },
            { name: "level_tag_id", type: "int", note: "→ config: designation_id" },
            { name: "post", type: "tinyint", note: "→ config: post_date" },
            { name: "status", type: "varchar", note: "→ config: delivery_status" },
          ],
        },
        {
          id: "assessment_link_question",
          name: "assessment_link_question",
          status: "migrated",
          migratesTo: "qf_delivery_payload (bridge)",
          columns: [
            { name: "task_link_question_id", type: "PK", note: "" },
            { name: "assessment_id", type: "FK", note: "→ delivery_id" },
            { name: "question_id", type: "FK", note: "→ payload_id" },
          ],
        },
        {
          id: "assessment_semester_plans",
          name: "assessment_semester_plans",
          status: "migrated",
          migratesTo: "qf_delivery.semester_id",
          columns: [
            { name: "assessment_plan_id", type: "PK", note: "" },
            { name: "assessment_id", type: "FK", note: "" },
            { name: "semester_id", type: "int", note: "→ qf_delivery.semester_id" },
          ],
        },
        {
          id: "question",
          name: "question",
          status: "migrated",
          migratesTo: "qf_payload (type=question, is_mcq=0)",
          columns: [
            { name: "question_id", type: "PK", note: "" },
            { name: "discription", type: "text", note: "→ qf_payload.body" },
            { name: "total_marks", type: "decimal", note: "→ config: total_marks" },
            { name: "attachment", type: "varchar", note: "→ qf_resource + qf_content_delivery" },
            { name: "answer_type", type: "varchar", note: "→ config: type" },
            { name: "statement", type: "text", note: "→ qf_payload.body (merged)" },
            { name: "arabic", type: "tinyint", note: "→ config: arabic" },
            { name: "instructions", type: "text", note: "→ config: instructions" },
            { name: "statement_formatted", type: "text", note: "→ config: statement_formatted" },
          ],
        },
        {
          id: "quiz",
          name: "quiz",
          status: "migrated",
          migratesTo: "qf_delivery (type=quiz)",
          columns: [
            { name: "id", type: "PK", note: "" },
            { name: "title", type: "varchar", note: "→ qf_delivery.title" },
            { name: "description", type: "text", note: "→ qf_delivery.description" },
            { name: "sequence", type: "int", note: "→ config: sequence" },
            { name: "afterNumberItems", type: "int", note: "→ config: after_n_items" },
            { name: "level_tag_id", type: "int", note: "→ config: designation_id" },
            { name: "owner_id", type: "int", note: "→ qf_delivery.owner_id" },
            { name: "status", type: "varchar", note: "→ config: delivery_status" },
          ],
        },
        {
          id: "quiz_mcq_question",
          name: "quiz_mcq_question",
          status: "migrated",
          migratesTo: "qf_delivery_payload (bridge)",
          columns: [
            { name: "id", type: "PK", note: "" },
            { name: "quiz_id", type: "FK", note: "→ delivery_id" },
            { name: "mcq_question_id", type: "FK", note: "→ payload_id" },
          ],
        },
        {
          id: "quiz_semester",
          name: "quiz_semester",
          status: "migrated",
          migratesTo: "qf_delivery.semester_id",
          columns: [
            { name: "quiz_id", type: "FK", note: "" },
            { name: "semester_id", type: "int", note: "→ qf_delivery.semester_id" },
          ],
        },
        {
          id: "mcq_question",
          name: "mcq_question",
          status: "migrated",
          migratesTo: "qf_payload (type=question, is_mcq=1)",
          columns: [
            { name: "id", type: "PK", note: "" },
            { name: "title", type: "varchar", note: "→ qf_payload.body" },
            { name: "correct_option", type: "varchar", note: "→ config: correct_option_id" },
            { name: "type", type: "varchar", note: "→ config: type" },
            { name: "question_sequence", type: "int", note: "→ config: question_sequence" },
          ],
        },
        {
          id: "mcq_question_option",
          name: "mcq_question_option",
          status: "migrated",
          migratesTo: "qf_payload (type=option)",
          columns: [
            { name: "id", type: "PK", note: "" },
            { name: "mcq_question_id", type: "FK", note: "→ parent question via qf_delivery_payload" },
            { name: "option", type: "varchar", note: "→ qf_payload.body" },
            { name: "option_number", type: "int", note: "→ config: option_number" },
          ],
        },
        {
          id: "ta_live_sessions",
          name: "ta_live_sessions",
          status: "migrated",
          migratesTo: "qf_delivery (type=ta_live_session)",
          columns: [
            { name: "lvs_id", type: "PK", note: "" },
            { name: "lvs_title", type: "varchar", note: "→ qf_delivery.title" },
            { name: "lvs_link", type: "varchar", note: "→ config: session_link" },
            { name: "lvs_category", type: "varchar", note: "→ config: session_category" },
            { name: "lvs_level_tags", type: "varchar", note: "→ config: level_tags" },
            { name: "lvs_posted_date", type: "date", note: "→ config: post_date" },
            { name: "lvs_posted_time", type: "time", note: "→ config: session_posted_time" },
            { name: "lvs_posted_day", type: "varchar", note: "→ config: post_week_day" },
            { name: "lvs_teaching_assistant", type: "int", note: "→ config: teaching_assistant_id" },
            { name: "time_zone", type: "varchar", note: "→ config: session_time_zone" },
            { name: "gender_scope", type: "varchar", note: "→ config: session_gender_scope" },
            { name: "elective_id", type: "int", note: "→ config: elective_id" },
            { name: "is_core_session", type: "tinyint", note: "→ config: is_core" },
          ],
        },
        {
          id: "ta_meeting_room_links",
          name: "ta_meeting_room_links",
          status: "migrated",
          migratesTo: "qf_resource (resource_type=ta_profile)",
          columns: [
            { name: "id", type: "PK", note: "" },
            { name: "ta_id", type: "int", note: "→ config: ta_urdd_id" },
            { name: "link", type: "varchar", note: "→ config: link_url" },
            { name: "time_zone", type: "varchar", note: "→ config: time_zone" },
          ],
        },
        {
          id: "ta_schedule_timing",
          name: "ta_schedule_timing",
          status: "migrated",
          migratesTo: "qf_config slot rows on qf_resource (ta_profile)",
          columns: [
            { name: "id", type: "PK", note: "" },
            { name: "ta_mtr_link", type: "FK", note: "→ resource_id of ta_profile" },
            { name: "day", type: "tinyint", note: "→ config: slot_day (per slot group)" },
            { name: "start_time", type: "time", note: "→ config: slot_start_time" },
            { name: "end_time", type: "time", note: "→ config: slot_end_time" },
            { name: "time_zone", type: "varchar", note: "→ config: time_zone" },
            { name: "valid_from", type: "date", note: "→ config: slot_valid_from" },
            { name: "valid_till", type: "date", note: "→ config: slot_valid_till" },
          ],
        },
      ],
    },

    // ── RESPONSES ─────────────────────────────────────────────────────────────
    {
      id: "responses-old",
      side: "old",
      cluster: "response",
      label: "Responses cluster — OLD",
      annotation: "Assessment submissions carried a full snapshot of the assessment at submit-time (title, description, all question data), creating massive data redundancy. Quiz and assessment scoring lived in completely separate tables despite being the same concept.",
      tables: [
        {
          id: "answer",
          name: "answer",
          status: "migrated",
          migratesTo: "qf_student_responses",
          columns: [
            { name: "answer_id", type: "PK", note: "" },
            { name: "user_id", type: "int", note: "→ student_id (urdd_id)" },
            { name: "student_submitted_assessment_id", type: "FK", note: "→ via qf_delivery_responses" },
            { name: "question_id", type: "FK", note: "→ payload_id" },
            { name: "discription", type: "text", note: "→ student_response" },
            { name: "marks_obtained", type: "decimal", note: "→ response_score" },
            { name: "attachment", type: "varchar", note: "→ stored in student_response (ref)" },
            { name: "statement", type: "text", note: "→ student_response (merged)" },
          ],
        },
        {
          id: "student_submitted_assessment",
          name: "student_submitted_assessment",
          status: "migrated",
          migratesTo: "qf_delivery_responses (bridge)",
          columns: [
            { name: "student_submitted_assessment_id", type: "PK", note: "" },
            { name: "assessment_id", type: "FK", note: "→ delivery_id" },
            { name: "assessment_status", type: "varchar", note: "→ future config key" },
            { name: "title", type: "varchar", note: "SNAPSHOT — dropped (payload is source of truth)" },
            { name: "discription", type: "text", note: "SNAPSHOT — dropped" },
            { name: "content", type: "text", note: "SNAPSHOT — dropped" },
            { name: "owner_id", type: "int", note: "SNAPSHOT — dropped" },
            { name: "assessment_week", type: "int", note: "SNAPSHOT — dropped" },
            { name: "reviewed_by", type: "int", note: "→ grader_id on qf_student_responses" },
            { name: "reviewed_date", type: "date", note: "→ graded_at on qf_student_responses" },
            { name: "user_link_level_tag_id", type: "int", note: "→ student_id (resolved)" },
            { name: "rejection_reason", type: "text", note: "→ future config key" },
          ],
        },
        {
          id: "student_submitted_assessment_link_answer",
          name: "student_submitted_assessment_link_answer",
          status: "dropped",
          migratesTo: "DROPPED — snapshot bridge, no migration needed",
          columns: [
            { name: "id", type: "PK", note: "" },
            { name: "student_submitted_assessment_id", type: "FK", note: "snapshot redundancy" },
            { name: "question_id", type: "int", note: "snapshot redundancy" },
            { name: "question_discription", type: "text", note: "DROPPED — payload immutable" },
            { name: "question_total_marks", type: "decimal", note: "DROPPED — read from payload config" },
            { name: "question_attachment", type: "varchar", note: "DROPPED — read from qf_resource" },
            { name: "question_answer_type", type: "varchar", note: "DROPPED — read from payload config" },
            { name: "marks_obtained", type: "decimal", note: "DROPPED — on qf_student_responses" },
            { name: "attachment", type: "varchar", note: "DROPPED" },
          ],
        },
        {
          id: "assessment_score",
          name: "assessment_score",
          status: "migrated",
          migratesTo: "qf_student_responses (response_score + grader_id)",
          columns: [
            { name: "id", type: "PK", note: "" },
            { name: "student_submitted_assessment_id", type: "FK", note: "→ via delivery_responses" },
            { name: "score", type: "decimal", note: "→ response_score" },
            { name: "scored_by", type: "int", note: "→ grader_id (urdd_id)" },
            { name: "paramter_id", type: "int", note: "→ future config key (rubric param)" },
          ],
        },
        {
          id: "feedback",
          name: "feedback",
          status: "migrated",
          migratesTo: "qf_student_responses (grader comment row)",
          columns: [
            { name: "feedback_id", type: "PK", note: "" },
            { name: "comment", type: "text", note: "→ student_response where grader_id is set" },
            { name: "attachment", type: "varchar", note: "→ qf_resource + qf_content_delivery" },
            { name: "user_id", type: "int", note: "→ grader_id" },
            { name: "student_submitted_assessment_link_answer_id", type: "FK", note: "→ payload_id (resolved)" },
            { name: "flag", type: "tinyint", note: "→ future config key" },
          ],
        },
        {
          id: "feedback_parameters",
          name: "feedback_parameters",
          status: "migrated",
          migratesTo: "Future config keys on qf_student_responses",
          columns: [
            { name: "id", type: "PK", note: "" },
            { name: "name", type: "varchar", note: "→ config: rubric_param_name" },
            { name: "description", type: "text", note: "→ config: rubric_param_description" },
            { name: "status", type: "varchar", note: "→ config: rubric_param_status" },
          ],
        },
        {
          id: "quiz_score",
          name: "quiz_score",
          status: "migrated",
          migratesTo: "qf_student_responses (per-answer rows)",
          columns: [
            { name: "id", type: "PK", note: "" },
            { name: "user_link_level_tag_id", type: "int", note: "→ student_id" },
            { name: "quiz_id", type: "FK", note: "→ delivery_id via qf_delivery_responses" },
            { name: "total_questions", type: "int", note: "DERIVED: COUNT(qf_delivery_payload WHERE delivery_id=x)" },
            { name: "score", type: "decimal", note: "DERIVED: SUM(response_score) per student per delivery" },
            { name: "status", type: "varchar", note: "→ future config key" },
          ],
        },
        {
          id: "quiz_user_link_missing_level_tag",
          name: "quiz_user_link_missing_level_tag",
          status: "migrated",
          migratesTo: "Future config key on qf_delivery_responses",
          columns: [
            { name: "id", type: "PK", note: "" },
            { name: "user_id", type: "int", note: "→ student_id reference" },
            { name: "level_tag_id", type: "int", note: "→ future config: missing_level_tag_id" },
            { name: "semester_id", type: "int", note: "→ via qf_delivery.semester_id" },
          ],
        },
        {
          id: "user_link_lesson",
          name: "user_link_lesson",
          status: "migrated",
          migratesTo: "qf_student_responses (payload_id=NULL) + qf_delivery_responses",
          columns: [
            { name: "user_link_lesson_id", type: "PK", note: "" },
            { name: "user_link_level_tag_id", type: "int", note: "→ student_id" },
            { name: "lesson_id", type: "FK", note: "→ delivery_id" },
          ],
        },
        {
          id: "notifications_settings_new",
          name: "notifications_settings_new",
          status: "migrated",
          migratesTo: "qf_config (target_table=qf_user_notification)",
          columns: [
            { name: "id", type: "PK", note: "" },
            { name: "title", type: "varchar", note: "→ config: notification_title" },
            { name: "detail", type: "text", note: "→ config: notification_detail" },
            { name: "type", type: "varchar", note: "→ config: notification_type" },
            { name: "for_year", type: "int", note: "→ config: notification_for_year" },
          ],
        },
        {
          id: "users_notifications_settings_new",
          name: "users_notifications_settings_new",
          status: "migrated",
          migratesTo: "qf_config key: notification_enabled (record_id=user_id)",
          columns: [
            { name: "id", type: "PK", note: "" },
            { name: "user_id", type: "int", note: "→ record_id in qf_config" },
            { name: "notification_setting_id", type: "FK", note: "→ config: notification_type ref" },
            { name: "flag", type: "tinyint", note: "→ config: notification_enabled (0/1)" },
          ],
        },
        {
          id: "user_clear_notifications",
          name: "user_clear_notifications",
          status: "migrated",
          migratesTo: "qf_config key: notification_cleared_at (record_id=user_id)",
          columns: [
            { name: "id", type: "PK", note: "" },
            { name: "user_id", type: "int", note: "→ record_id in qf_config" },
            { name: "un_id", type: "int", note: "→ config: notification_instance_id" },
          ],
        },
      ],
    },

    // ── DROPPED LOG TABLES ────────────────────────────────────────────────────
    {
      id: "dropped-old",
      side: "old",
      cluster: "dropped",
      label: "Operational logs — DROPPED",
      annotation: "Pure operational/debug log tables. No business data to migrate. Move monitoring to a dedicated log sink (DataDog, CloudWatch, etc.) outside the application database.",
      tables: [
        { id: "debug_logs", name: "debug_logs", status: "dropped", migratesTo: "DROPPED", columns: [{ name: "id", type: "PK", note: "" }, { name: "message", type: "text", note: "→ external log sink" }, { name: "type", type: "varchar", note: "" }, { name: "created_at", type: "datetime", note: "" }] },
        { id: "error_logs", name: "error_logs", status: "dropped", migratesTo: "DROPPED", columns: [{ name: "el_id", type: "PK", note: "" }, { name: "el_data", type: "text", note: "→ external log sink" }, { name: "el_note", type: "text", note: "" }, { name: "el_verb", type: "varchar", note: "" }] },
        { id: "log", name: "log", status: "dropped", migratesTo: "DROPPED", columns: [{ name: "id", type: "PK", note: "" }, { name: "level", type: "varchar", note: "→ external log sink" }, { name: "category", type: "varchar", note: "" }, { name: "message", type: "text", note: "" }] },
        { id: "request_log", name: "request_log", status: "dropped", migratesTo: "DROPPED", columns: [{ name: "id", type: "PK", note: "" }, { name: "method", type: "varchar", note: "→ APM / request tracing" }, { name: "url", type: "varchar", note: "" }, { name: "response_status", type: "int", note: "" }] },
        { id: "isoft_log", name: "isoft_log", status: "dropped", migratesTo: "DROPPED", columns: [{ name: "il_id", type: "PK", note: "" }, { name: "il_data", type: "text", note: "→ external log sink" }] },
        { id: "internal_launch_automation_logs", name: "internal_launch_automation_logs", status: "dropped", migratesTo: "DROPPED", columns: [{ name: "id", type: "PK", note: "" }, { name: "message", type: "text", note: "→ external log sink" }] },
        { id: "in_app_purhcase_logs", name: "in_app_purhcase_logs", status: "dropped", migratesTo: "DROPPED", columns: [{ name: "id", type: "PK", note: "" }, { name: "message", type: "text", note: "→ external log sink" }] },
        { id: "test", name: "test", status: "dropped", migratesTo: "DROPPED", columns: [{ name: "id", type: "PK", note: "" }] },
      ],
    },

    // ── NEW SCHEMA ────────────────────────────────────────────────────────────
    {
      id: "new-core",
      side: "new",
      cluster: "core",
      label: "Core EAV engine — NEW",
      annotation: "qf_config_keys is the self-documenting controlled vocabulary. Every attribute key must be registered here before use. qf_config stores all flexible/sparse attributes for every table in the system — one row per attribute per record.",
      tables: [
        {
          id: "qf_config_keys",
          name: "qf_config_keys",
          status: "new",
          migratesTo: "NEW — controls vocabulary for qf_config",
          columns: [
            { name: "config_key_id", type: "PK", note: "SMALLINT — lookup FK target" },
            { name: "config_key", type: "varchar(80)", note: "Attribute name e.g. 'post_date', 'is_mcq'" },
            { name: "target_table", type: "varchar(80)", note: "Which base_table this key applies to" },
            { name: "value_type", type: "varchar(20)", note: "varchar | int | bool | decimal | datetime | text | json" },
            { name: "description", type: "text", note: "Human-readable description — makes DB self-documenting" },
            { name: "created_at", type: "datetime", note: "" },
          ],
        },
        {
          id: "qf_config",
          name: "qf_config",
          status: "altered",
          migratesTo: "ALTERED — config_key_id FK added",
          columns: [
            { name: "id", type: "PK", note: "" },
            { name: "base_table", type: "varchar", note: "Name of the table this row belongs to" },
            { name: "record_id", type: "bigint", note: "PK of the row in base_table" },
            { name: "config_key_id", type: "FK NEW", note: "→ qf_config_keys.config_key_id — enforces vocabulary" },
            { name: "config_key", type: "varchar", note: "Kept for legacy read compatibility" },
            { name: "config_value", type: "text", note: "Serialised value — cast per value_type on read" },
          ],
        },
      ],
    },
    {
      id: "new-delivery",
      side: "new",
      cluster: "delivery",
      label: "Delivery cluster — NEW",
      annotation: "Three tables replace 13. Any new content type (podcast, live workshop, coding exercise) is a new row in qf_delivery_types — no schema change. All scheduling, audience, and behavioural metadata lives in qf_config.",
      tables: [
        {
          id: "qf_delivery_types",
          name: "qf_delivery_types",
          status: "new",
          migratesTo: "NEW — extensible type registry",
          columns: [
            { name: "delivery_type_id", type: "PK TINYINT", note: "" },
            { name: "name", type: "varchar(64)", note: "lesson | quiz | assessment | ta_live_session | email_template | page_content | note | ta_recording | tutorial | welcome_video" },
            { name: "label", type: "varchar(128)", note: "Human-readable UI label" },
            { name: "created_at", type: "datetime", note: "" },
          ],
        },
        {
          id: "qf_delivery",
          name: "qf_delivery",
          status: "new",
          migratesTo: "NEW — absorbs lessons, assessment, quiz, ta_live_sessions, email_templates, page_content, notes, ta_recordings, tutorials, welcome_videos",
          columns: [
            { name: "delivery_id", type: "PK", note: "" },
            { name: "delivery_type_id", type: "FK", note: "→ qf_delivery_types" },
            { name: "title", type: "varchar(512)", note: "NOT NULL" },
            { name: "description", type: "text", note: "" },
            { name: "owner_id", type: "bigint", note: "urdd_id of teacher/admin creator" },
            { name: "semester_id", type: "bigint", note: "FK → qf_semester (denormalised shortcut)" },
            { name: "created_at", type: "datetime", note: "" },
            { name: "updated_at", type: "datetime", note: "" },
          ],
        },
        {
          id: "qf_payload",
          name: "qf_payload",
          status: "new",
          migratesTo: "NEW — absorbs question, mcq_question, mcq_question_option, email_templates.html, page_content.content, notes.body, mail_merger",
          columns: [
            { name: "payload_id", type: "PK", note: "" },
            { name: "body", type: "MEDIUMTEXT", note: "Question stem | option text | HTML body | note body | mail variable" },
            { name: "created_at", type: "datetime", note: "" },
            { name: "updated_at", type: "datetime", note: "" },
          ],
        },
      ],
    },
    {
      id: "new-content",
      side: "new",
      cluster: "content",
      label: "Content + bridges — NEW",
      annotation: "qf_resource is a universal content handle. Bridge tables replace all semester_plan and link tables with a single consistent pattern. One resource can attach to many deliveries; one delivery can have many resources.",
      tables: [
        {
          id: "qf_resource",
          name: "qf_resource",
          status: "new",
          migratesTo: "NEW — absorbs resource, support_links, ta_meeting_room_links+ta_schedule_timing (as ta_profile), lesson_link_video (as video resource)",
          columns: [
            { name: "resource_id", type: "PK", note: "" },
            { name: "attachment_id", type: "bigint", note: "FK → file store. NULL for virtual resources (ta_profile, support_link)" },
            { name: "created_at", type: "datetime", note: "" },
            { name: "updated_at", type: "datetime", note: "" },
          ],
        },
        {
          id: "qf_delivery_payload",
          name: "qf_delivery_payload",
          status: "new",
          migratesTo: "NEW — replaces assessment_link_question, quiz_mcq_question",
          columns: [
            { name: "id", type: "PK", note: "" },
            { name: "delivery_id", type: "FK", note: "→ qf_delivery" },
            { name: "payload_id", type: "FK", note: "→ qf_payload" },
            { name: "sequence", type: "smallint", note: "Display order within the delivery (0-based)" },
          ],
        },
        {
          id: "qf_content_delivery",
          name: "qf_content_delivery",
          status: "new",
          migratesTo: "NEW — replaces all semester_plan bridge tables (lesson_semester_plans, resource_semester_plan, tutorial_semester_plan, assessment_semester_plans)",
          columns: [
            { name: "id", type: "PK", note: "" },
            { name: "delivery_id", type: "FK", note: "→ qf_delivery" },
            { name: "resource_id", type: "FK", note: "→ qf_resource" },
          ],
        },
      ],
    },
    {
      id: "new-responses",
      side: "new",
      cluster: "response",
      label: "Responses cluster — NEW",
      annotation: "Two tables replace 9. No snapshot columns — payload is the immutable source of truth. MCQ auto-grading, manual grading, lesson views, and teacher feedback are all unified into the same row structure. Aggregate scores are computed at query time.",
      tables: [
        {
          id: "qf_student_responses",
          name: "qf_student_responses",
          status: "new",
          migratesTo: "NEW — absorbs answer, quiz_score, assessment_score, feedback, user_link_lesson",
          columns: [
            { name: "student_response_id", type: "PK", note: "" },
            { name: "student_id", type: "bigint", note: "urdd_id — NOT NULL" },
            { name: "payload_id", type: "FK nullable", note: "→ qf_payload. NULL for lesson-view events" },
            { name: "student_response", type: "MEDIUMTEXT", note: "Answer text OR attachment reference. NULL for lesson views" },
            { name: "response_score", type: "DECIMAL(10,4)", note: "NULL until graded. Auto-set for MCQ; manual for assessments" },
            { name: "grader_id", type: "bigint nullable", note: "urdd_id of teacher/TA. NULL until graded" },
            { name: "submitted_at", type: "datetime", note: "NOT NULL DEFAULT NOW()" },
            { name: "graded_at", type: "datetime nullable", note: "NULL until graded" },
          ],
        },
        {
          id: "qf_delivery_responses",
          name: "qf_delivery_responses",
          status: "new",
          migratesTo: "NEW — replaces student_submitted_assessment, student_submitted_assessment_link_answer",
          columns: [
            { name: "id", type: "PK", note: "" },
            { name: "delivery_id", type: "FK", note: "→ qf_delivery" },
            { name: "student_response_id", type: "FK", note: "→ qf_student_responses" },
          ],
        },
      ],
    },
  ],
};

// ─── COLOUR CONFIG ────────────────────────────────────────────────────────────
const CLUSTER_COLORS = {
  content:  { fill: T.contentFill,  border: T.contentBorder,  accent: T.contentAccent,  text: T.contentText,  label: "Content" },
  delivery: { fill: T.deliveryFill, border: T.deliveryBorder, accent: T.deliveryAccent, text: T.deliveryText, label: "Delivery" },
  response: { fill: T.responseFill, border: T.responseBorder, accent: T.responseAccent, text: T.responseText, label: "Responses" },
  core:     { fill: T.coreFill,     border: T.coreBorder,     accent: T.coreAccent,     text: T.coreText,     label: "Core EAV" },
  dropped:  { fill: T.dropped,      border: T.droppedBdr,     accent: T.droppedAcc,     text: T.droppedTxt,   label: "Dropped" },
};

const STATUS_COLORS = {
  migrated: { bg: "#0e2a0e", border: "#22c55e", text: "#86efac", label: "migrated" },
  dropped:  { bg: "#2a0e0e", border: "#ef4444", text: "#fca5a5", label: "dropped" },
  dissolved:{ bg: "#1a1a0e", border: "#eab308", text: "#fde047", label: "dissolved" },
  new:      { bg: "#0e0e2a", border: "#6366f1", text: "#a5b4fc", label: "new" },
  altered:  { bg: "#2a1a0e", border: "#f97316", text: "#fdba74", label: "altered" },
};

// ─── EDITABLE TEXT ────────────────────────────────────────────────────────────
function EditableText({ value, onChange, style, multiline, className }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => { setEditing(false); onChange(draft); };

  if (editing) {
    const shared = {
      value: draft,
      onChange: e => setDraft(e.target.value),
      onBlur: commit,
      onKeyDown: e => { if (!multiline && e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value); setEditing(false); } },
      autoFocus: true,
      style: {
        background: "#1e1e2e",
        border: "1px solid " + T.arrowHi,
        borderRadius: 4,
        color: T.text,
        fontFamily: "inherit",
        fontSize: "inherit",
        padding: "2px 6px",
        width: "100%",
        outline: "none",
        resize: multiline ? "vertical" : "none",
        ...style,
      },
    };
    return multiline
      ? <textarea rows={3} {...shared} />
      : <input {...shared} />;
  }
  return (
    <span
      className={className}
      onClick={() => { setDraft(value); setEditing(true); }}
      title="Click to edit"
      style={{ cursor: "text", ...style }}
    >
      {value}
    </span>
  );
}

// ─── COLUMN ROW ───────────────────────────────────────────────────────────────
function ColumnRow({ col, colIdx, tableId, clusterId, onUpdate, onDelete, onAdd }) {
  const isSnap = col.note.startsWith("SNAPSHOT");
  const isDerived = col.note.startsWith("DERIVED");
  const isPK = col.type === "PK" || col.type.startsWith("PK");
  const isFK = col.type === "FK" || col.type.startsWith("FK");
  const isNew = col.type.includes("NEW");

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 6,
      padding: "3px 8px",
      background: isSnap ? "rgba(239,68,68,0.06)" : isDerived ? "rgba(245,158,11,0.06)" : "transparent",
      borderLeft: isSnap ? "2px solid rgba(239,68,68,0.4)" : isDerived ? "2px solid rgba(245,158,11,0.4)" : "2px solid transparent",
      borderRadius: 3,
    }}>
      <div style={{ flex: "0 0 140px", display: "flex", alignItems: "center", gap: 4 }}>
        {isPK && <span style={{ fontSize: 9, background: "#1e3a5f", color: "#93c5fd", borderRadius: 3, padding: "1px 4px", fontWeight: 600 }}>PK</span>}
        {isFK && <span style={{ fontSize: 9, background: "#1a3a1a", color: "#86efac", borderRadius: 3, padding: "1px 4px", fontWeight: 600 }}>FK</span>}
        {isNew && <span style={{ fontSize: 9, background: "#1a1a3a", color: "#a5b4fc", borderRadius: 3, padding: "1px 4px", fontWeight: 600 }}>NEW</span>}
        <EditableText
          value={col.name}
          onChange={v => onUpdate(clusterId, tableId, colIdx, "name", v)}
          style={{ fontSize: 12, color: isPK ? "#93c5fd" : isFK ? "#86efac" : T.text, fontFamily: "'JetBrains Mono', monospace" }}
        />
      </div>
      <div style={{ flex: "0 0 100px" }}>
        <EditableText
          value={col.type}
          onChange={v => onUpdate(clusterId, tableId, colIdx, "type", v)}
          style={{ fontSize: 11, color: T.textMuted, fontFamily: "'JetBrains Mono', monospace" }}
        />
      </div>
      <div style={{ flex: 1 }}>
        <EditableText
          value={col.note}
          onChange={v => onUpdate(clusterId, tableId, colIdx, "note", v)}
          style={{
            fontSize: 11,
            color: isSnap ? "#fca5a5" : isDerived ? "#fde047" : col.note.startsWith("→") ? "#6ee7b7" : T.textMuted,
            fontStyle: "italic",
          }}
        />
      </div>
      <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
        <button onClick={() => onAdd(clusterId, tableId, colIdx)} style={btnStyle("#1a3a1a", "#22c55e")} title="Add column below">+</button>
        <button onClick={() => onDelete(clusterId, tableId, colIdx)} style={btnStyle("#3a1a1a", "#ef4444")} title="Delete column">×</button>
      </div>
    </div>
  );
}

const btnStyle = (bg, color) => ({
  background: bg, border: `1px solid ${color}44`, color,
  borderRadius: 3, width: 18, height: 18, fontSize: 12,
  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
  padding: 0, lineHeight: 1, flexShrink: 0,
});

// ─── TABLE CARD ───────────────────────────────────────────────────────────────
function TableCard({ table, clusterId, clusterColors, onUpdate, onDelete, onDeleteTable, onAddColumn, onDeleteColumn, collapsed, onToggleCollapse }) {
  const sc = STATUS_COLORS[table.status] || STATUS_COLORS.migrated;

  return (
    <div style={{
      background: T.surfaceHi,
      border: `1px solid ${clusterColors.border}`,
      borderRadius: 8,
      overflow: "hidden",
      marginBottom: 8,
    }}>
      {/* Table header */}
      <div style={{
        background: clusterColors.fill,
        borderBottom: `1px solid ${clusterColors.border}`,
        padding: "7px 10px",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <button onClick={() => onToggleCollapse(table.id)} style={{
          background: "none", border: "none", color: T.textMuted,
          cursor: "pointer", fontSize: 11, padding: 0, flexShrink: 0,
        }}>{collapsed ? "▶" : "▼"}</button>

        <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: clusterColors.accent, fontWeight: 600, flex: 1 }}>
          <EditableText value={table.name} onChange={v => onUpdate(clusterId, table.id, "name", v)} style={{ color: clusterColors.accent }} />
        </span>

        <span style={{
          fontSize: 9, fontWeight: 600, padding: "2px 7px",
          background: sc.bg, border: `1px solid ${sc.border}44`,
          color: sc.text, borderRadius: 20,
        }}>{sc.label}</span>

        <button onClick={() => onDeleteTable(clusterId, table.id)} style={{ ...btnStyle("#3a1a1a", "#ef4444"), marginLeft: 4 }} title="Delete table">×</button>
      </div>

      {/* Migration destination */}
      {!collapsed && (
        <div style={{ padding: "5px 10px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "flex-start", gap: 6 }}>
          <span style={{ fontSize: 10, color: T.textDim, flexShrink: 0, marginTop: 1 }}>↳</span>
          <EditableText
            value={table.migratesTo}
            onChange={v => onUpdate(clusterId, table.id, "migratesTo", v)}
            multiline
            style={{ fontSize: 11, color: sc.text, fontStyle: "italic", flex: 1 }}
          />
        </div>
      )}

      {/* Columns */}
      {!collapsed && (
        <div style={{ padding: "4px 0" }}>
          {table.columns.map((col, ci) => (
            <ColumnRow
              key={ci}
              col={col}
              colIdx={ci}
              tableId={table.id}
              clusterId={clusterId}
              onUpdate={onDeleteColumn}
              onDelete={(cid, tid, idx) => onDeleteColumn(cid, tid, idx)}
              onAdd={(cid, tid, idx) => onAddColumn(cid, tid, idx)}
            />
          ))}
          <button
            onClick={() => onAddColumn(clusterId, table.id, table.columns.length - 1)}
            style={{
              display: "block", width: "100%", background: "none",
              border: "none", borderTop: `1px dashed ${T.border}`,
              color: T.textDim, fontSize: 11, cursor: "pointer",
              padding: "4px 8px", textAlign: "left",
            }}
          >+ add column</button>
        </div>
      )}
    </div>
  );
}

// ─── CLUSTER BOX ─────────────────────────────────────────────────────────────
function ClusterBox({ cluster, onUpdateCluster, onUpdateTable, onUpdateColumn, onDeleteTable, onAddTable, onDeleteColumn, onAddColumn, collapsedTables, onToggleCollapse, collapsedCluster, onToggleCluster }) {
  const cc = CLUSTER_COLORS[cluster.cluster] || CLUSTER_COLORS.core;

  return (
    <div style={{
      background: cc.fill + "88",
      border: `1.5px solid ${cc.border}`,
      borderRadius: 12,
      padding: 12,
      marginBottom: 16,
    }}>
      {/* Cluster header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <button onClick={() => onToggleCluster(cluster.id)} style={{ background: "none", border: "none", color: cc.accent, cursor: "pointer", fontSize: 14, padding: 0 }}>
          {collapsedCluster ? "▶" : "▼"}
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: cc.accent, letterSpacing: "0.02em" }}>
            <EditableText value={cluster.label} onChange={v => onUpdateCluster(cluster.id, "label", v)} style={{ color: cc.accent }} />
          </div>
          {!collapsedCluster && (
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 3 }}>
              <EditableText value={cluster.annotation} onChange={v => onUpdateCluster(cluster.id, "annotation", v)} multiline style={{ color: T.textMuted }} />
            </div>
          )}
        </div>
        <span style={{ fontSize: 10, color: cc.text, background: cc.fill, border: `1px solid ${cc.border}`, borderRadius: 20, padding: "2px 8px", flexShrink: 0 }}>
          {cluster.tables.length} tables
        </span>
      </div>

      {!collapsedCluster && (
        <>
          {cluster.tables.map(table => (
            <TableCard
              key={table.id}
              table={table}
              clusterId={cluster.id}
              clusterColors={cc}
              onUpdate={(cid, tid, field, val) => onUpdateTable(cid, tid, field, val)}
              onDeleteTable={onDeleteTable}
              onAddColumn={onAddColumn}
              onDeleteColumn={onDeleteColumn}
              collapsed={!!collapsedTables[table.id]}
              onToggleCollapse={onToggleCollapse}
            />
          ))}
          <button
            onClick={() => onAddTable(cluster.id)}
            style={{
              display: "block", width: "100%", background: "none",
              border: `1px dashed ${cc.border}`, borderRadius: 6,
              color: cc.text, fontSize: 11, cursor: "pointer", padding: "6px 10px",
              textAlign: "center",
            }}
          >+ add table to cluster</button>
        </>
      )}
    </div>
  );
}

// ─── STATS BAR ────────────────────────────────────────────────────────────────
function StatsBar({ data }) {
  const old = data.clusters.filter(c => c.side === "old");
  const nw  = data.clusters.filter(c => c.side === "new");
  const oldCount = old.reduce((s, c) => s + c.tables.length, 0);
  const newCount = nw.reduce((s, c) => s + c.tables.length, 0);
  const dropped  = old.reduce((s, c) => s + c.tables.filter(t => t.status === "dropped").length, 0);
  const migrated = old.reduce((s, c) => s + c.tables.filter(t => t.status === "migrated").length, 0);
  const dissolved = old.reduce((s, c) => s + c.tables.filter(t => t.status === "dissolved").length, 0);

  const stat = (val, lbl, color) => (
    <div style={{ textAlign: "center", flex: 1 }}>
      <div style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1.1 }}>{val}</div>
      <div style={{ fontSize: 10, color: T.textMuted, marginTop: 2 }}>{lbl}</div>
    </div>
  );

  return (
    <div style={{
      display: "flex", gap: 1, background: T.surface,
      border: `1px solid ${T.border}`, borderRadius: 10,
      padding: "14px 20px", marginBottom: 20,
    }}>
      {stat(oldCount, "old tables", T.droppedAcc)}
      <div style={{ width: 1, background: T.border, margin: "0 8px" }} />
      {stat(newCount, "new tables", T.coreAccent)}
      <div style={{ width: 1, background: T.border, margin: "0 8px" }} />
      {stat(oldCount - newCount, "eliminated", T.responseAccent)}
      <div style={{ width: 1, background: T.border, margin: "0 8px" }} />
      {stat(migrated, "migrated", T.deliveryAccent)}
      <div style={{ width: 1, background: T.border, margin: "0 8px" }} />
      {stat(dissolved, "dissolved", "#eab308")}
      <div style={{ width: 1, background: T.border, margin: "0 8px" }} />
      {stat(dropped, "dropped", T.droppedAcc)}
    </div>
  );
}

// ─── LEGEND ───────────────────────────────────────────────────────────────────
function Legend() {
  const items = Object.entries(STATUS_COLORS).map(([k, v]) => (
    <span key={k} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: v.bg, border: `1px solid ${v.border}`, flexShrink: 0 }} />
      <span style={{ color: v.text }}>{v.label}</span>
    </span>
  ));
  const colItems = Object.entries(CLUSTER_COLORS).map(([k, v]) => (
    <span key={k} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10 }}>
      <span style={{ width: 8, height: 8, borderRadius: 2, background: v.fill, border: `1px solid ${v.border}`, flexShrink: 0 }} />
      <span style={{ color: v.text }}>{v.label}</span>
    </span>
  ));
  return (
    <div style={{
      display: "flex", gap: 16, flexWrap: "wrap",
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 8, padding: "8px 14px", marginBottom: 16, alignItems: "center",
    }}>
      <span style={{ fontSize: 10, color: T.textDim, fontWeight: 600, marginRight: 4 }}>STATUS:</span>
      {items}
      <span style={{ width: 1, background: T.border, alignSelf: "stretch" }} />
      <span style={{ fontSize: 10, color: T.textDim, fontWeight: 600, marginRight: 4 }}>CLUSTER:</span>
      {colItems}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [data, setData] = useState(INITIAL_DATA);
  const [collapsedTables, setCollapsedTables] = useState({});
  const [collapsedClusters, setCollapsedClusters] = useState({});
  const [activeView, setActiveView] = useState("both");

  // ── helpers ─────────────────────────────────────────────────────────────────
  const updateCluster = useCallback((clusterId, field, val) => {
    setData(d => ({ ...d, clusters: d.clusters.map(c => c.id === clusterId ? { ...c, [field]: val } : c) }));
  }, []);

  const updateTable = useCallback((clusterId, tableId, field, val) => {
    setData(d => ({
      ...d,
      clusters: d.clusters.map(c => c.id !== clusterId ? c : {
        ...c,
        tables: c.tables.map(t => t.id !== tableId ? t : { ...t, [field]: val }),
      }),
    }));
  }, []);

  const updateColumn = useCallback((clusterId, tableId, colIdx, field, val) => {
    setData(d => ({
      ...d,
      clusters: d.clusters.map(c => c.id !== clusterId ? c : {
        ...c,
        tables: c.tables.map(t => t.id !== tableId ? t : {
          ...t,
          columns: t.columns.map((col, i) => i !== colIdx ? col : { ...col, [field]: val }),
        }),
      }),
    }));
  }, []);

  const deleteTable = useCallback((clusterId, tableId) => {
    setData(d => ({
      ...d,
      clusters: d.clusters.map(c => c.id !== clusterId ? c : {
        ...c, tables: c.tables.filter(t => t.id !== tableId),
      }),
    }));
  }, []);

  const addTable = useCallback((clusterId) => {
    const id = "table_" + Date.now();
    setData(d => ({
      ...d,
      clusters: d.clusters.map(c => c.id !== clusterId ? c : {
        ...c,
        tables: [...c.tables, { id, name: "new_table", status: "new", migratesTo: "→ destination", columns: [{ name: "id", type: "PK", note: "" }] }],
      }),
    }));
  }, []);

  const addColumn = useCallback((clusterId, tableId, afterIdx) => {
    setData(d => ({
      ...d,
      clusters: d.clusters.map(c => c.id !== clusterId ? c : {
        ...c,
        tables: c.tables.map(t => {
          if (t.id !== tableId) return t;
          const cols = [...t.columns];
          cols.splice(afterIdx + 1, 0, { name: "new_column", type: "varchar", note: "→ destination" });
          return { ...t, columns: cols };
        }),
      }),
    }));
  }, []);

  const deleteColumn = useCallback((clusterId, tableId, colIdx) => {
    setData(d => ({
      ...d,
      clusters: d.clusters.map(c => c.id !== clusterId ? c : {
        ...c,
        tables: c.tables.map(t => t.id !== tableId ? t : {
          ...t, columns: t.columns.filter((_, i) => i !== colIdx),
        }),
      }),
    }));
  }, []);

  const toggleTableCollapse = useCallback((tableId) => {
    setCollapsedTables(p => ({ ...p, [tableId]: !p[tableId] }));
  }, []);

  const toggleClusterCollapse = useCallback((clusterId) => {
    setCollapsedClusters(p => ({ ...p, [clusterId]: !p[clusterId] }));
  }, []);

  const collapseAll = () => {
    const t = {}; data.clusters.forEach(c => c.tables.forEach(tbl => { t[tbl.id] = true; }));
    setCollapsedTables(t);
  };
  const expandAll = () => setCollapsedTables({});

  const old = data.clusters.filter(c => c.side === "old");
  const nw  = data.clusters.filter(c => c.side === "new");

  const clusterProps = (cluster) => ({
    cluster,
    onUpdateCluster: updateCluster,
    onUpdateTable: updateTable,
    onUpdateColumn: updateColumn,
    onDeleteTable: deleteTable,
    onAddTable: addTable,
    onDeleteColumn: deleteColumn,
    onAddColumn: addColumn,
    collapsedTables,
    onToggleCollapse: toggleTableCollapse,
    collapsedCluster: !!collapsedClusters[cluster.id],
    onToggleCluster: toggleClusterCollapse,
  });

  return (
    <div style={{ background: T.bg, minHeight: "100vh", fontFamily: "'JetBrains Mono', 'Fira Code', monospace", color: T.text, padding: "20px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: T.text, marginBottom: 4, letterSpacing: "-0.02em" }}>
          <EditableText value={data.title} onChange={v => setData(d => ({ ...d, title: v }))} style={{ fontSize: 22, fontWeight: 700, color: T.text }} />
        </h1>
        <p style={{ fontSize: 12, color: T.textMuted, marginBottom: 12 }}>
          <EditableText value={data.subtitle} onChange={v => setData(d => ({ ...d, subtitle: v }))} style={{ fontSize: 12, color: T.textMuted }} />
        </p>

        {/* Controls */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {["both", "old", "new"].map(v => (
            <button key={v} onClick={() => setActiveView(v)} style={{
              padding: "4px 14px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: "inherit",
              background: activeView === v ? T.arrowHi : T.surface,
              border: `1px solid ${activeView === v ? T.arrowHi : T.border}`,
              color: activeView === v ? "#fff" : T.textMuted,
            }}>
              {v === "both" ? "Both sides" : v === "old" ? "Old schema" : "New schema"}
            </button>
          ))}
          <div style={{ width: 1, background: T.border, height: 20 }} />
          <button onClick={collapseAll} style={{ padding: "4px 14px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: "inherit", background: T.surface, border: `1px solid ${T.border}`, color: T.textMuted }}>Collapse all</button>
          <button onClick={expandAll} style={{ padding: "4px 14px", borderRadius: 6, fontSize: 11, cursor: "pointer", fontFamily: "inherit", background: T.surface, border: `1px solid ${T.border}`, color: T.textMuted }}>Expand all</button>
          <span style={{ fontSize: 10, color: T.textDim, marginLeft: 4 }}>Click any text to edit it</span>
        </div>
      </div>

      <StatsBar data={data} />
      <Legend />

      {/* Main layout */}
      <div style={{
        display: "grid",
        gridTemplateColumns: activeView === "both" ? "1fr 1fr" : "1fr",
        gap: 20,
        alignItems: "start",
      }}>
        {(activeView === "both" || activeView === "old") && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.droppedAcc, letterSpacing: "0.1em", marginBottom: 12, textTransform: "uppercase" }}>
              ← Old schema (82 tables)
            </div>
            {old.map(c => <ClusterBox key={c.id} {...clusterProps(c)} />)}
          </div>
        )}

        {(activeView === "both" || activeView === "new") && (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.deliveryAccent, letterSpacing: "0.1em", marginBottom: 12, textTransform: "uppercase" }}>
              New schema (22 core tables) →
            </div>
            {nw.map(c => <ClusterBox key={c.id} {...clusterProps(c)} />)}
          </div>
        )}
      </div>
    </div>
  );
}

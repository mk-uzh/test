# AI System Classification Assessment

**Document type:** Internal record — EU AI Act alignment  
**Regulation:** Regulation (EU) 2024/1689 (Artificial Intelligence Act)  
**Status:** Accepted classification for current product design; update if models, data flows, or deployment context change.

---

This application qualifies as an AI system under Article 3(1) of Regulation (EU) 2024/1689 (EU AI Act). It uses machine learning models including logistic regression and random forest classifiers that infer risk scores from environmental and historical input data. This classification is acknowledged and the following compliance measures apply.

## Compliance measures

1. **Classification ownership** — This assessment is kept as an internal baseline. Any material change to model types, training data, or output use triggers a new review and document revision.

2. **Transparency (proportionate)** — User-facing text describes the service in plain language; detailed technical and legal classification remains in internal compliance documentation, not in product marketing as legal advice.

3. **User agency** — The system presents risk-related information. It does not replace user judgment, professional advice, or compliance with local rules; registration flows require explicit user acknowledgement of that limitation (consent / confirmation step).

4. **Data governance** — Environmental and historical inputs used for inference are processed in line with the project’s data protection and security practices; access and retention are limited to what is needed for the service.

5. **Oversight and updates** — Responsible roles should periodically confirm that the described models and use cases still match this assessment and that applicable AI Act provisions (including timelines and secondary acts) are monitored.

6. **Coordination** — This document is read together with the separate internal memo on high-risk **non-**inclusion (Annex III / Article 6) where applicable; do not use one without the other for a complete internal picture.

---

## State of the Art (launch record)

**Date stamp:** 24.04.2026  
**Launch quarter reference:** Q2 2026

At the time of development (Q2 2026), peer-reviewed literature established that state-of-the-art machine learning models for avalanche danger prediction, trained on 20 years of institutionally curated Swiss Alps data, achieved validation accuracy of approximately 76–77% (Sharma et al., 2023, NHESS). Consumer applications relying on publicly available weather and incident data operate under materially greater uncertainty. This limitation is inherent to the current state of the technology and is disclosed to users within the application.

### Citations

- Sharma et al. (2023). *Natural Hazards and Earth System Sciences (NHESS)* — peer-reviewed avalanche danger prediction study reporting approximately 76-77% validation accuracy on long-horizon Swiss Alps institutional data.
- In-app TrailSafe disclosures implemented in `js/app.js` and user-facing safety/uncertainty notices in UI (`css/style.css`), including confidence, data limitations, and timestamp visibility.

---

*Internal use only. Not legal advice.*

import json
from typing import Dict, Any, List, Optional, Tuple
from app.services.clinical_rules import clinical_rules

class LateFusionService:
    FEATURE_ALIASES = {
        "finger_tap_frequency_hz": "right_finger_tap_frequency_hz",
        "finger_tap_mean_amplitude": "right_finger_tap_mean_amplitude",
        "finger_tap_interval_cv": "right_finger_tap_iti_cv",
        "ddk_regularity_score": "ddk_regularity_cv"
    }

    def __init__(self):
        self.reload_config()

    def reload_config(self):
        from app.core.config import settings
        clinical_rules.scoring_rules = clinical_rules._load_json(settings.SCORING_RULES_PATH)
        self.rules_config = clinical_rules.scoring_rules
        self.references = self.rules_config.get("reference_ranges", {})
        self.domain_weights = self.rules_config.get("domain_weights", {
            "motor": 0.35,
            "speech": 0.35,
            "facial": 0.30,
            "gait": 0.0,
            "balance": 0.0,
            "cognition": 0.0
        })
        self.pattern_rules = self.rules_config.get("pattern_rules", [])

    def calculate_multimodal_index(
        self,
        facial_deviation: Optional[float] = None,
        motor_deviation: Optional[float] = None,
        vocal_deviation: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Legacy helper for direct 3-channel deviation index calculation.
        Rule: Unavailable beats invented. Missing is not abnormal.
        """
        weights = {"facial": 0.30, "motor": 0.35, "vocal": 0.35}
        active_weights = {}
        active_deviations = {}
        if facial_deviation is not None:
            active_weights["facial"] = weights["facial"]
            active_deviations["facial"] = facial_deviation
        if motor_deviation is not None:
            active_weights["motor"] = weights["motor"]
            active_deviations["motor"] = motor_deviation
        if vocal_deviation is not None:
            active_weights["vocal"] = weights["vocal"]
            active_deviations["vocal"] = vocal_deviation

        total_weight = sum(active_weights.values())
        if total_weight == 0:
            return {
                "composite_deviation_score": None,
                "status_label": "Unassessed",
                "traceability": "No active modalities available."
            }
        
        composite = sum(active_deviations[k] * (active_weights[k] / total_weight) for k in active_weights)
        composite = round(composite, 2)
        return {
            "composite_deviation_score": composite,
            "status_label": "Watch" if composite >= 1.0 else "Nominal",
            "contributing_modalities": list(active_weights.keys()),
            "traceability": f"Aggregated across {list(active_weights.keys())}"
        }

    def compute_feature_z_score(self, feature_name: str, value: float) -> Optional[Dict[str, Any]]:
        """
        Calculates directional z-score: z = (value - reference_mean) / reference_sd
        """
        ref = self.references.get(feature_name)
        if not ref:
            # Check aliases
            alias = self.FEATURE_ALIASES.get(feature_name)
            if alias:
                ref = self.references.get(alias)
        
        if not ref or ref.get("sd", 0) <= 0:
            return None

        mean = ref["mean"]
        sd = ref["sd"]
        direction = ref.get("direction", "bidirectional")
        z_raw = (value - mean) / sd

        # Assess directional significance
        deviation_magnitude = abs(z_raw)
        is_clinically_validated = ref.get("is_clinically_validated", False)

        return {
            "feature_name": feature_name,
            "value": round(value, 3),
            "reference_mean": mean,
            "reference_sd": sd,
            "z_score": round(z_raw, 2),
            "deviation_magnitude": round(deviation_magnitude, 2),
            "direction": direction,
            "unit": ref.get("unit", ""),
            "source": ref.get("source", "prototype_norm_v1"),
            "is_clinically_validated": is_clinically_validated,
            "limitation_notice": ref.get("limitation_notice", "Prototype placeholder reference.")
        }

    def compute_domain_scores(self, scored_features: List[Dict[str, Any]]) -> Dict[str, Optional[float]]:
        """
        Interpretable weighted aggregation per domain.
        Rule: Missing or insufficient-quality modalities must be excluded.
        Missing data must NOT increase a score.
        """
        domains: Dict[str, List[float]] = {
            "motor": [],
            "speech": [],
            "facial": [],
            "gait": [],
            "balance": [],
            "cognition": []
        }

        for feat in scored_features:
            fname = feat["feature_name"]
            dev = feat["deviation_magnitude"]
            if "finger_tap" in fname or "motor" in fname:
                domains["motor"].append(dev)
            elif "speech" in fname or "vocal" in fname or "ddk" in fname or "pitch" in fname or "harmonics" in fname:
                domains["speech"].append(dev)
            elif "facial" in fname or "smile" in fname or "eyebrow" in fname or "blink" in fname:
                domains["facial"].append(dev)

        domain_scores: Dict[str, Optional[float]] = {}
        for d, vals in domains.items():
            if vals:
                domain_scores[d] = round(sum(vals) / len(vals), 2)
            else:
                domain_scores[d] = None

        return domain_scores

    def evaluate_pattern_rules(
        self,
        features_map: Dict[str, float],
        z_map: Dict[str, float],
        quality_status: str = "valid"
    ) -> List[Dict[str, Any]]:
        """
        Rule-based pattern analysis.
        Rule: Do not output disease names as conclusions.
        Multimodal patterns REQUIRE evidence from at least two relevant domains!
        """
        if quality_status == "insufficient":
            return []

        triggered_patterns: List[Dict[str, Any]] = []

        for rule in self.pattern_rules:
            rule_id = rule["rule_id"]
            title = rule["title"]
            explanation = rule["explanation"]
            criteria = rule.get("criteria", [])
            operator = rule.get("operator", "AND")
            requires_multimodal = rule.get("requires_multimodal", False)

            matched_criteria = []
            contributing_domains = set()

            for crit in criteria:
                fname = crit["feature"]
                op = crit["op"]
                threshold = crit["threshold"]
                domain = crit.get("domain", "motor" if "tap" in fname else "speech" if "ddk" in fname else "facial")

                val = features_map.get(fname)
                z = z_map.get(fname)
                if val is None:
                    for alias_k, alias_v in self.FEATURE_ALIASES.items():
                        if fname == alias_v and alias_k in features_map:
                            val = features_map.get(alias_k)
                            break
                        elif fname == alias_k and alias_v in features_map:
                            val = features_map.get(alias_v)
                            break
                if z is None:
                    for alias_k, alias_v in self.FEATURE_ALIASES.items():
                        if fname == alias_v and alias_k in z_map:
                            z = z_map.get(alias_k)
                            break
                        elif fname == alias_k and alias_v in z_map:
                            z = z_map.get(alias_v)
                            break

                is_met = False
                if op == "z_lte" and z is not None:
                    is_met = z <= threshold
                elif op == "z_gte" and z is not None:
                    is_met = z >= threshold
                elif op == "val_gte" and val is not None:
                    is_met = val >= threshold
                elif op == "val_lte" and val is not None:
                    is_met = val <= threshold

                if is_met:
                    matched_criteria.append({
                        "feature": fname,
                        "value": val,
                        "z_score": z,
                        "threshold": threshold,
                        "domain": domain
                    })
                    contributing_domains.add(domain)

            # Evaluate pass condition
            rule_triggered = False
            if operator == "AND":
                rule_triggered = len(matched_criteria) == len(criteria)
            else: # "OR"
                rule_triggered = len(matched_criteria) > 0

            # Guard: A one-domain deviation must NOT trigger a multimodal pattern!
            if requires_multimodal and len(contributing_domains) < 2:
                rule_triggered = False

            if rule_triggered:
                actual_vals = {c["feature"]: c["value"] for c in matched_criteria}
                ref_vals = {c["feature"]: self.references.get(c["feature"], {}).get("mean") for c in matched_criteria}
                triggered_patterns.append({
                    "rule_id": rule_id,
                    "title": title,
                    "explanation": explanation,
                    "triggering_features": [c["feature"] for c in matched_criteria],
                    "actual_values": actual_vals,
                    "reference_values": ref_vals,
                    "quality": quality_status,
                    "domains": list(contributing_domains)
                })

        return triggered_patterns

    def calculate_multimodal_assessment(
        self,
        features: List[Dict[str, Any]],
        quality_status: str = "valid"
    ) -> Dict[str, Any]:
        """
        Full fusion scoring pipeline:
        1. Feature Z-scores
        2. Domain scores
        3. Pattern analysis
        4. Overall monitoring status: "No flag" | "Watch" | "Review advised"
        """
        if quality_status == "insufficient" or not features:
            return {
                "overall_status": "No flag",
                "composite_deviation_score": None,
                "domain_scores": {d: None for d in self.domain_weights},
                "scored_features": [],
                "patterns": [],
                "summary": "Insufficient recording quality or missing channels. No neurological finding generated.",
                "advisory": "Quality is not pathology. Retake is required for reliable evaluation."
            }

        features_map = {f["feature_name"]: f["value"] for f in features}
        scored_features = []
        z_map = {}

        for f in features:
            res = self.compute_feature_z_score(f["feature_name"], f["value"])
            if res:
                scored_features.append(res)
                z_map[f["feature_name"]] = res["z_score"]

        domain_scores = self.compute_domain_scores(scored_features)

        # Weighted composite score across active domains
        active_weights = {}
        for d, score in domain_scores.items():
            if score is not None and self.domain_weights.get(d, 0) > 0:
                active_weights[d] = self.domain_weights[d]

        total_weight = sum(active_weights.values())
        if total_weight > 0:
            composite_z = sum(
                domain_scores[d] * (active_weights[d] / total_weight) for d in active_weights
            )
            composite_z = round(composite_z, 2)
        else:
            composite_z = None

        patterns = self.evaluate_pattern_rules(features_map, z_map, quality_status)

        # Overall Status determination
        # Statuses: "No flag", "Watch", "Review advised"
        if composite_z is None:
            overall_status = "No flag"
        elif composite_z >= 2.0 or len(patterns) >= 2 or any(p["rule_id"] == "RULE_COORDINATION_MULTIMODAL" for p in patterns):
            overall_status = "Review advised"
        elif composite_z >= 1.0 or len(patterns) > 0:
            overall_status = "Watch"
        else:
            overall_status = "No flag"

        summary = (
            f"Multimodal contactless assessment completed ({len(features)} metrics analyzed). "
            f"Overall Monitoring Status: {overall_status} "
            f"(Composite Deviation Index: {composite_z if composite_z is not None else 'N/A'}). "
            f"{f'{len(patterns)} explainable behavioral pattern(s) identified.' if patterns else 'No notable deviations flagged.'}"
        )

        return {
            "overall_status": overall_status,
            "composite_deviation_score": composite_z,
            "domain_scores": domain_scores,
            "scored_features": scored_features,
            "patterns": patterns,
            "summary": summary,
            "advisory": "NeuroCare is a clinical decision support tool. Statuses represent monitoring alerts, not medical diagnoses."
        }

late_fusion = LateFusionService()

def merge_what_skill(skill_info: dict, args: dict) -> dict:
    return {**skill_info, "topic": args["topic"], "definition": args["definition"], "target": args["target"]}


def merge_content(skill_info: dict, args: dict) -> dict:
    return {**skill_info, "content": args}


def merge_name(skill_info: dict, args: dict) -> dict:
    return {**skill_info, "name": args["name"]}


def merge_test_report(skill_info: dict, args: dict) -> dict:
    return {**skill_info, "testReport": args}


def merge_improve(skill_info: dict, args: dict) -> dict:
    content = dict(skill_info.get("content") or {})
    for field, value in args.items():
        if value is not None:
            content[field] = value
    return {**skill_info, "content": content}

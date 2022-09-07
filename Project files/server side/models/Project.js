const { Schema, model } = require("mongoose");

const projectSchema = new Schema({
  title: {
    type: String,
    required: [true, "Project must have a title!"],
    minlength: 1,
    maxlength: 80,
  },
  owners: [
    {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  tasks: [
    {
      type: Schema.Types.ObjectId,
      ref: "Task",
    },
  ],
  clients: [
    {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  ],
});

const Project = model("Project", projectSchema);

module.exports = Project;

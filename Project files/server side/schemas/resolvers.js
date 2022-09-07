const { User, Project, Task, Comment, LoggedTime } = require("../models");
const { signToken } = require("../utils/auth");
const { AuthenticationError } = require("apollo-server-express");

const resolvers = {
  Query: {
    me: async (_, __, context) => {
      if (context.user) {
        const currentUserData = await User.findById(context.user._id).select(
          "-__v, -password"
        );
        return currentUserData;
      }
      throw new AuthenticationError("Not logged in.");
    },

    myProjects: async (_, __, context) => {
      if (context.user) {
        const { projects } = await User.findById(context.user._id)
          .select("projects")
          .populate("projects");
        return projects;
      }
      throw new AuthenticationError("Not logged in.");
    },

    project: async (_, { _id }, context) => {
      if (context.user) {
        const projectData = await Project.findById(_id).select(
          "owners clients"
        );
        if (!projectData) {
          throw new Error("Project not found.");
        }
        if (
          projectData.owners.includes(context.user._id) ||
          projectData.clients.includes(context.user._id)
        ) {
          return await Project.findById(_id)
            .populate("owners")
            .populate("tasks")
            .populate("clients");
        }
        throw new AuthenticationError("Not authorized.");
      }
      throw new AuthenticationError("Not logged in.");
    },

    task: async (_, { _id }, context) => {
      if (context.user) {
        const taskData = await Task.findById(_id);
        if (!taskData) {
          throw new Error("Task not found.");
        }
        const projectUsers = await Project.findById(taskData.project).select(
          "owners clients"
        );
        if (
          projectUsers.owners.includes(context.user._id) ||
          projectUsers.clients.includes(context.user._id)
        ) {
          return await Task.findById(_id)
            .populate("project")
            .populate({ path: "comments", populate: { path: "user" } })
            .populate("timeLog");
        }
        throw new AuthenticationError("Not authorized.");
      }
      throw new AuthenticationError("Not logged in.");
    },
  },

  Mutation: {
    addUser: async (_, { newUser }) => {
      const user = await User.create(newUser);
      const token = signToken(user);
      return { token, user };
    },

    login: async (_, { email, password }) => {
      const user = await User.findOne({ email: email });
      if (!user) throw new AuthenticationError("Incorrect login credentials.");
      const correctPw = await user.isCorrectPassword(password);
      if (!correctPw)
        throw new AuthenticationError("Incorrect login credentials.");
      const token = signToken(user);
      return { token, user };
    },

    updateUser: async (_, { userInputs }, context) => {
      if (context.user) {
        return await User.findByIdAndUpdate(context.user._id, userInputs, {
          new: true,
          runValidators: true,
        });
      }
      throw new AuthenticationError("Not logged in.");
    },

    deleteUser: async (_, { password }, context) => {
      if (context.user) {
        const user = await User.findById(context.user._id);
        const correctPw = await user.isCorrectPassword(password);
        if (correctPw) {
          return await User.findByIdAndDelete(user._id);
        }
        throw new AuthenticationError("Incorrect password.");
      }
      throw new AuthenticationError("Not logged in.");
    },

    addProject: async (_, { projectInputs }, context) => {
      if (context.user) {
        const newProject = await Project.create(projectInputs);
        await newProject.update(
          { $addToSet: { owners: context.user._id } },
          { new: true }
        );
        await User.findByIdAndUpdate(context.user._id, {
          $addToSet: { projects: newProject._id },
        });
        return await Project.findById(newProject._id)
          .populate("owners")
          .populate("tasks")
          .populate("clients");
      }
      throw new AuthenticationError("You must be logged in to add a project.");
    },

    updateProjectTitle: async (_, { projectId, title }, context) => {
      if (context.user) {
        const projectData = await Project.findById(projectId).select(
          "owners clients"
        );
        if (!projectData) {
          throw new Error("Project not found.");
        }
        if (
          projectData.owners.includes(context.user._id) ||
          projectData.clients.includes(context.user._id)
        ) {
          return await Project.findByIdAndUpdate(
            projectId,
            { title: title },
            { new: true, runValidators: true }
          )
            .populate("owners")
            .populate("tasks")
            .populate("clients");
        }
        throw new AuthenticationError("Not authorized.");
      }
      throw new AuthenticationError("Not logged in.");
    },

    addClientToProject: async (_, { projectId, clientInputs }, context) => {
      if (context.user) {
        const projectData = await Project.findById(projectId).select("owners");
        if (!projectData) {
          throw new Error("Project not found.");
        }
        if (projectData.owners.includes(context.user._id)) {
          const userAlreadyExists = await User.exists({
            email: clientInputs.email,
          });
          let client;
          if (userAlreadyExists) {
            client = await User.findOneAndUpdate(
              { email: clientInputs.email },
              { $addToSet: { projects: projectId } },
              { new: true, runValidators: true }
            );
          } else {
            client = await User.create({
              ...clientInputs,
              projects: [projectId],
            });
          }
          return await Project.findByIdAndUpdate(
            projectId,
            { $addToSet: { clients: client._id } },
            { new: true, runValidators: true }
          )
            .populate("owners")
            .populate("tasks")
            .populate("clients");
        }
        throw new AuthenticationError("Not authorized.");
      }
      throw new AuthenticationError("Not logged in.");
    },

    deleteProject: async (_, { projectId }, context) => {
      if (context.user) {
        const projectData = await Project.findById(projectId).select("owners");
        if (!projectData) {
          throw new Error("Project not found.");
        }
        if (projectData.owners.includes(context.user._id)) {
          return await Project.findByIdAndDelete(projectId);
        }
        throw new AuthenticationError("Not authorized.");
      }
      throw new AuthenticationError("Not logged in.");
    },

    addTask: async (_, { taskInputs }, context) => {
      if (context.user) {
        const projectUsers = await Project.findById(
          taskInputs.projectId
        ).select("owners clients");
        if (!projectUsers) {
          throw new Error("Project not found.");
        }
        if (
          projectUsers.owners.includes(context.user._id) ||
          projectUsers.clients.includes(context.user._id)
        ) {
          const newTask = await Task.create({
            ...taskInputs,
            project: taskInputs.projectId,
          });
          await Project.findByIdAndUpdate(taskInputs.projectId, {
            $push: { tasks: newTask._id },
          });
          return newTask;
        }
        throw new AuthenticationError("Not authorized.");
      }
      throw new AuthenticationError("Not logged in.");
    },

    updateTask: async (_, { taskInputs }, context) => {
      if (context.user) {
        const taskData = await Task.findById(taskInputs.taskId);
        const projectUsers = await Project.findById(taskData.project).select(
          "owners"
        );
        if (projectUsers.owners.includes(context.user._id)) {
          return Task.findByIdAndUpdate(taskInputs.taskId, taskInputs, {
            new: true,
            runValidators: true,
          })
            .populate("project")
            .populate({ path: "comments", populate: { path: "user" } })
            .populate({ path: "timeLog", populate: { path: "user" } });
        }
        throw new AuthenticationError("Not authorized.");
      }
      throw new AuthenticationError("Not logged in.");
    },

    deleteTask: async (_, { taskId }, context) => {
      if (context.user) {
        const taskData = await Task.findById(taskId);
        const projectUsers = await Project.findById(taskData.project).select(
          "owners"
        );
        if (projectUsers.owners.includes(context.user._id)) {
          return Task.findByIdAndDelete(taskId);
        }
        throw new AuthenticationError("Not authorized.");
      }
      throw new AuthenticationError("Not logged in.");
    },

    addComment: async (_, { taskId, body }, context) => {
      if (context.user) {
        const taskData = await Task.findById(taskId).select("project");
        if (!taskData) {
          throw new Error("Task not found.");
        }
        const projectUsers = await Project.findById(taskData.project).select(
          "owners clients"
        );
        if (
          projectUsers.owners.includes(context.user._id) ||
          projectUsers.clients.includes(context.user._id)
        ) {
          const comment = await Comment.create({
            body: body,
            user: context.user,
            taskId: taskId,
          });
          await Task.findByIdAndUpdate(
            taskId,
            { $push: { comments: comment._id } },
            { new: true, runValidators: true }
          );
          return await Comment.findById(comment._id).populate("user");
        }
        throw new AuthenticationError("Not authorized.");
      }
      throw new AuthenticationError("Not logged in.");
    },

    deleteComment: async (_, { commentId }, context) => {
      if (context.user) {
        const comment = await Comment.findById(commentId).select("user taskId");
        if (comment.user._id.toString() === context.user._id) {
          await Task.findByIdAndUpdate(comment.taskId, {
            $pull: { comments: comment._id },
          });
          return Comment.findByIdAndDelete(commentId);
        }
        throw new AuthenticationError("Not authorized.");
      }
      throw new AuthenticationError("Not logged in.");
    },

    addLoggedTime: async (_, { loggedTimeInputs }, context) => {
      if (context.user) {
        const taskData = await Task.findById(loggedTimeInputs.taskId).select(
          "project"
        );
        if (!taskData) {
          throw new Error("Task not found.");
        }
        const projectUsers = await Project.findById(taskData.project).select(
          "owners"
        );
        if (projectUsers.owners.includes(context.user._id)) {
          const loggedTime = await LoggedTime.create({
            description: loggedTimeInputs.description,
            hours: loggedTimeInputs.hours
              ? parseFloat(loggedTimeInputs.hours)
              : 0,
            user: context.user,
            taskId: loggedTimeInputs.taskId,
          });
          await Task.findByIdAndUpdate(
            loggedTimeInputs.taskId,
            { $push: { timeLog: loggedTime._id } },
            { new: true, runValidators: true }
          );
          return await LoggedTime.findById(loggedTime._id).populate("user");
        }
        throw new AuthenticationError("Not authorized.");
      }
      throw new AuthenticationError("Not logged in.");
    },
  },
};

module.exports = resolvers;
